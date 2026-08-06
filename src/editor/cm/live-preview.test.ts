import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import type { DecorationSet, Decoration } from '@codemirror/view';
import { build, blockEnd } from './live-preview';

function st(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ extensions: [GFM] })],
  });
}

interface D { from: number; to: number; block: boolean; widget?: string; cls?: string; }
function decos(set: DecorationSet, docLen: number): D[] {
  const out: D[] = [];
  set.between(0, docLen, (from: number, to: number, value: Decoration) => {
    const s = value.spec as { block?: boolean; widget?: { constructor: { name: string } }; class?: string };
    out.push({ from, to, block: !!s.block, widget: s.widget?.constructor?.name, cls: s.class });
  });
  return out;
}

const ext = (s: EditorState) => decos(build(s), s.doc.length);

describe('标题 ATXHeading', () => {
  it('光标在标题行 → 不渲染（显示源码）', () => {
    const s = st('# t', 0);
    expect(ext(s).length).toBe(0);
  });
  it('光标离开 → 隐藏 # 并加 md-h1', () => {
    const s = st('# t\n\nx', 6); // 光标在 x 行
    const d = ext(s);
    expect(d.some((x) => x.cls === 'md-h1')).toBe(true);
  });
  it('## → md-h2', () => {
    const s = st('## t\n\nx', 7);
    expect(ext(s).some((x) => x.cls === 'md-h2')).toBe(true);
  });
});

describe('围栏代码 FencedCode', () => {
  const doc = '```js\ncode\n```\n\nx';
  it('光标离开 → 每行 md-code-line 行装饰（逐行渲染，保留行号/导航）', () => {
    const s = st(doc, doc.length);
    const d = ext(s);
    const codeLines = d.filter((x) => x.cls?.includes('md-code-line'));
    // 三行代码（```js / code / ```）各有深色行装饰
    expect(codeLines.length).toBe(3);
  });
  it('光标离开 → 生成语言标签 widget', () => {
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'CodeBlockLabelWidget')).toBe(true);
  });
  it('光标在代码块内 → 不渲染（源码）', () => {
    const s = st(doc, 6); // 光标在 code 行
    const d = ext(s);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(false);
  });
});

describe('缩进代码块 CodeBlock', () => {
  it('4空格缩进 → 每行 md-code-line 行装饰', () => {
    const doc = '    code\n\nx';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.cls?.includes('md-code-line'))).toBe(true);
  });
});

describe('表格 Table', () => {
  it('GFM 表格 → block replace + TableWidget', () => {
    const doc = '| a | b |\n|---|---|\n| 1 | 2 |\n\nx';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'TableWidget' && x.block)).toBe(true);
  });
});

describe('数学公式', () => {
  it('块公式行首 → block + BlockMathWidget', () => {
    const doc = '$$\nx\n$$\n\ny';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'BlockMathWidget' && x.block)).toBe(true);
  });
  it('行内公式 → inline InlineMathWidget', () => {
    const doc = 'a $x$ b\n\ny';
    const s = st(doc, doc.length); // 光标在 y 行，公式行非活跃
    const m = ext(s).find((x) => x.widget === 'InlineMathWidget');
    expect(m).toBeTruthy();
    expect(m!.block).toBe(false);
  });
  it('光标在行内公式行 → 不渲染', () => {
    const doc = 'a $x$ b';
    const s = st(doc, 3);
    expect(ext(s).some((x) => x.widget === 'InlineMathWidget')).toBe(false);
  });
});

describe('图片/任务标记', () => {
  it('图片 → ImageWidget', () => {
    const doc = '![alt](u.png)\n\nx';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'ImageWidget')).toBe(true);
  });
  it('任务标记 → CheckboxWidget', () => {
    const doc = '- [ ] t\n\nx';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'CheckboxWidget')).toBe(true);
  });
});

describe('行内标记', () => {
  it('加粗 → md-bold', () => {
    const s = st('**b**\n\nx', 8);
    expect(ext(s).some((d) => d.cls === 'md-bold')).toBe(true);
  });
  it('行内代码 → md-code-inline', () => {
    const s = st('`c`\n\nx', 6);
    expect(ext(s).some((d) => d.cls === 'md-code-inline')).toBe(true);
  });
});

describe('引用块 Blockquote（FR-2.2）', () => {
  it('光标离开 → md-blockquote 行装饰', () => {
    const s = st('> 引用文本\n\nx', 9);
    expect(ext(s).some((x) => x.cls?.includes('md-blockquote'))).toBe(true);
  });
  it('光标在引用行 → 源码（无装饰）', () => {
    const s = st('> 引用文本', 2);
    expect(ext(s).some((x) => x.cls?.includes('md-blockquote'))).toBe(false);
  });
  it('嵌套引用 → 深度 class md-blockquote-2', () => {
    const doc = '> 引用\n> > 嵌套\n\nx';
    const s = st(doc, doc.length);
    const d = ext(s);
    expect(d.some((x) => x.cls?.includes('md-blockquote-2'))).toBe(true);
  });
});

describe('内嵌 HTML', () => {
  it('HTMLBlock → block replace + HtmlWidget', () => {
    const s = st('<div>\nblock\n</div>\n\nx', 21);
    const hb = ext(s).find((x) => x.widget === 'HtmlWidget' && x.block);
    expect(hb).toBeTruthy();
  });
  it('行内 HTML 成对 → HtmlWidget', () => {
    const doc = '<mark>高亮</mark>\n\nx';
    const s = st(doc, doc.length);
    expect(ext(s).some((x) => x.widget === 'HtmlWidget')).toBe(true);
  });
  it('行内 HTML 光标所在行 → 不渲染', () => {
    const s = st('<mark>高亮</mark>', 3);
    expect(ext(s).some((x) => x.widget === 'HtmlWidget')).toBe(false);
  });
});

describe('blockEnd', () => {
  it('to 在行首 → 返回 to 本身', () => {
    const s = st('ab\ncd\nef', 7);
    // line(2).from = 3 (after 'ab\n'); line(3).from = 6 (after 'cd\n')
    expect(blockEnd(s, 6)).toBe(6); // 6 是第3行行首
  });
  it('to 在行中 → 扩到下一行首', () => {
    const s = st('ab\ncd\nef', 7);
    expect(blockEnd(s, 4)).toBe(6); // 4 在第2行中，扩到第3行首 6
  });
});
