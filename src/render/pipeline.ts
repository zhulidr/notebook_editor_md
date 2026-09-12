// 导出渲染管线（ARCHITECTURE.md §2 render/pipeline.ts，需求 FR-9.1）
// 目标：导出 HTML 与编辑器内渲染一致——KaTeX 公式、Shiki Darcula 代码块、GFM 表格/任务列表、Mermaid 图。
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?raw';
import mermaid from 'mermaid';
import { highlight } from '../highlight/shiki';
import { sanitizeHtml } from '../editor/widgets/html';
import { getCodeBg } from '../editor/cm/settings';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

const md = new MarkdownIt({ html: true, breaks: false, linkify: true, typographer: true });

// mermaid 渲染 ID 自增（连续多次导出时避免 id 冲突 "already defined"）
let mermaidSeq = 0;

// 导出管线同样消毒原始 HTML（块级/行内），避免导出文件含 <script>/事件属性等 XSS 载荷
// markdown-it 默认 html_block/html_inline 规则仅返回 tokens[idx].content，这里替换为消毒后的版本。
const sanitizeRawHtml = (tokens: { content: string }[], idx: number): string =>
  sanitizeHtml(tokens[idx].content);
md.renderer.rules.html_block = sanitizeRawHtml;
md.renderer.rules.html_inline = sanitizeRawHtml;

function katexHtml(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return tex;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface CodeBlock { code: string; lang: string; }

// 围栏代码：先渲染成占位符，渲染后再异步做 Shiki 高亮（高亮结果放入 env，避免跨调用污染）
md.renderer.rules.fence = (tokens, idx, _options, env) => {
  const t = tokens[idx];
  const lang = (t.info || '').trim().split(/\s+/)[0] || '';
  const blocks = (env.__code = env.__code ?? []) as CodeBlock[];
  blocks.push({ code: t.content.replace(/\n$/, ''), lang });
  return `@@CODE${blocks.length - 1}@@`;
};

// GFM 任务列表（FR-6.4 渲染态）：`- [ ] x` → checkbox，导出结果与编辑器内一致
function taskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task-lists', (state) => {
    for (const t of state.tokens) {
      if (t.type !== 'inline' || !t.children) continue;
      const first = t.children[0];
      if (!first || first.type !== 'text') continue;
      const m = first.content.match(/^\[([ xX])\]\s+/);
      if (!m) continue;
      first.content = first.content.slice(m[0].length);
      const checked = m[1].toLowerCase() === 'x';
      const tok = new state.Token('task_checkbox', '', 0);
      const attrs: [string, string][] = [['type', 'checkbox'], ['disabled', '']];
      if (checked) attrs.push(['checked', '']);
      tok.attrs = attrs;
      t.children.unshift(tok);
    }
    return true;
  });
}
taskLists(md);
md.renderer.rules.task_checkbox = (tokens, idx) => {
  const attrs = tokens[idx].attrs ?? [];
  return `<input${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>`;
};

// 先把公式替换成占位符，避免被 markdown-it 解析破坏（FR-3 全量公式）
export async function renderMarkdown(src: string): Promise<string> {
  const store: string[] = [];
  let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => {
    const h = katexHtml(t, true);
    store.push(h);
    return `\n\n@@MATH${store.length - 1}@@\n\n`;
  });
  s = s.replace(/\$([^\$\n]+?)\$/g, (_, t) => {
    const h = katexHtml(t, false);
    store.push(h);
    return `@@MATH${store.length - 1}@@`;
  });
  // Mermaid 块整体提出（先于 markdown-it，避免围栏被吞）
  const mermaidStore: string[] = [];
  s = s.replace(/```mermaid\s*\r?\n([\s\S]*?)\r?\n?```/g, (_, t) => {
    mermaidStore.push(t.replace(/\n$/, ''));
    return `\n\n@@MERMAID${mermaidStore.length - 1}@@\n\n`;
  });
  const env: Record<string, unknown> = {};
  let html = md.render(s, env);
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => store[+i]);
  // 代码块高亮（FR-4.1 Darcula 着色；未知语言纯文本兜底 FR-4.3）
  const blocks = (env.__code as CodeBlock[] | undefined) ?? [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const hl = await highlight(b.code, b.lang);
    html = html.replace(
      `@@CODE${i}@@`,
      hl ?? `<pre><code>${escapeHtml(b.code)}</code></pre>`,
    );
  }
  // Mermaid：整篇渲染为 SVG
  if (mermaidStore.length > 0) {
    // 重置 mermaid 内部状态并自增 ID，避免连续多次导出时 ID 冲突（"already defined"）
    let mid = mermaidSeq;
    for (let i = 0; i < mermaidStore.length; i++) {
      try {
        const { svg } = await mermaid.render(`export-mermaid-${mid++}`, mermaidStore[i]);
        html = html.replace(`@@MERMAID${i}@@`, `<div class="md-mermaid-export">${svg}</div>`);
      } catch {
        html = html.replace(`@@MERMAID${i}@@`, `<pre class="mermaid-fallback">${escapeHtml(mermaidStore[i])}</pre>`);
      }
    }
    mermaidSeq = mid;
  }
  return html;
}

export async function exportHtml(src: string): Promise<string> {
  const body = await renderMarkdown(src);
  const { bg: codeBg, fg: codeFg } = getCodeBg();
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>导出文档</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #1f2328; }
  pre, code { font-family: ui-monospace, Consolas, monospace; }
  pre { background: ${codeBg}; color: ${codeFg}; padding: 1rem; border-radius: 8px; overflow: auto; }
  pre.shiki { background: ${codeBg} !important; color: ${codeFg}; padding: 14px 16px; border-radius: 8px; overflow: auto; font-size: 13px; line-height: 1.5; }
  table { border-collapse: collapse; } th, td { border: 1px solid #e5e7eb; padding: 4px 10px; }
  th { background: #fafafa; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0; padding-left: 1rem; color: #6b7280; }
  img { max-width: 100%; }
  input[type="checkbox"] { margin-right: 6px; vertical-align: middle; }
  .md-mermaid-export { margin: 1rem 0; text-align: center; }
  .md-mermaid-export svg { max-width: 100%; height: auto; }
  .mermaid-fallback { background: #f6f8fa; color: #1f2328; }
${katexCss}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
