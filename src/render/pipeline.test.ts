import { describe, it, expect } from 'vitest';
import { renderMarkdown, exportHtml } from './pipeline';

describe('renderMarkdown', () => {
  it('行内公式', async () => {
    const html = await renderMarkdown('a $x^2$ b');
    expect(html).toContain('katex');
    expect(html).not.toContain('$x^2$');
  });
  it('块级公式', async () => {
    const html = await renderMarkdown('$$\\int x\\,dx$$');
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
  });
  it('公式与 markdown 共存', async () => {
    const html = await renderMarkdown('**b** $x$');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('katex');
  });
  it('表格', async () => {
    const html = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
  });
  it('代码块 Shiki 高亮（Darcula 主题）', async () => {
    const html = await renderMarkdown('```python\nx = 1\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('shiki');
    expect(html).toContain('#2B2B2B');
  });
  it('未知语言代码块纯文本兜底', async () => {
    const html = await renderMarkdown('```nosuchlang\nplain\n```');
    expect(html).toContain('<pre><code>plain</code></pre>');
  });
  it('任务列表 checkbox', async () => {
    const html = await renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
    expect(html).toContain('todo');
  });
  it('内嵌 HTML 透传（安全标签保留）', async () => {
    const html = await renderMarkdown('<mark>x</mark>');
    expect(html).toContain('<mark>x</mark>');
  });
  it('XSS 拦截：script / 事件属性 / javascript: 协议被移除', async () => {
    const html = await renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });
  it('XSS 拦截：嵌套标签混淆 <scr<script>ipt>', async () => {
    const html = await renderMarkdown('<scr<script>ipt>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<scr');
  });
  it('XSS 拦截：斜杠分隔事件属性 <img/onerror=>（markdown-it 转义为文本）', async () => {
    const html = await renderMarkdown('<img/onerror="alert(1)" src="x">');
    // markdown-it 将非法行内 HTML 转义为文本，不会产生真实 <img> 标签
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });
});

describe('exportHtml', () => {
  it('产出完整 HTML 文档', async () => {
    const html = await exportHtml('# T\n\n$x$');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('katex');
    expect(html).toContain('<h1');
  });
  it('KaTeX 样式内联（不依赖 CDN）', async () => {
    const html = await exportHtml('$x$');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).toContain('.katex{');
  });
});
