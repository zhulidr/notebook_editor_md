import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { EditorView, type DecorationSet, type Decoration } from '@codemirror/view';
import { build, blockEnd, livePreview, viewCapture } from './live-preview';

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

function testView(doc = '', cursor = doc.length): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [markdown({ extensions: [GFM] }), viewCapture, livePreview],
    }),
  });
}

function typeText(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text));
}

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

  it.each([
    { source: '**重点**', classes: ['md-bold'] },
    { source: '*斜体*', classes: ['md-italic'] },
    { source: '==高亮==', classes: ['md-highlight'] },
    { source: '***斜粗体***', classes: ['md-bold', 'md-italic'] },
  ])('$source 后通过中文输入法输入句号，光标保持在句号右侧', async ({ source, classes }) => {
    const view = testView();
    try {
      view.focus();

      // 模拟真人逐步完成闭合标记。光标恰好在右边界时必须保留源码，
      // 避免输入法在隐藏的闭合标记旁提交文字时重新映射 DOM 光标。
      typeText(view, source.slice(0, -1));
      typeText(view, source.slice(-1));
      expect(view.state.doc.toString()).toBe(source);
      expect(view.state.selection.main.head).toBe(source.length);
      for (const cls of classes) {
        expect(decos(view.state.field(livePreview), view.state.doc.length)
          .some((item) => item.cls?.includes(cls))).toBe(false);
      }

      view.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      view.dispatch({
        changes: { from: source.length, insert: '。' },
        selection: EditorSelection.cursor(source.length + 1),
        userEvent: 'input.type.compose.start',
      });

      expect(view.state.doc.toString()).toBe(`${source}。`);
      expect(view.state.selection.main.head).toBe(source.length + 1);

      view.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(view.state.doc.toString()).toBe(`${source}。`);
      expect(view.state.selection.main.head).toBe(source.length + 1);
      for (const cls of classes) {
        expect(decos(view.state.field(livePreview), view.state.doc.length)
          .some((item) => item.cls?.includes(cls))).toBe(true);
      }

      const domSelection = view.dom.ownerDocument.getSelection();
      expect(domSelection?.focusNode).not.toBeNull();
      expect(view.posAtDOM(domSelection!.focusNode!, domSelection!.focusOffset)).toBe(source.length + 1);
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  it('下一行以 = 开头时，加粗与斜粗体预览不因 Setext 解析而退回源码', async () => {
    const formatted = '**加粗。** ***粗斜体。***';
    const view = testView(`${formatted}\n`, formatted.length + 1);
    try {
      view.focus();
      typeText(view, '=');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const firstLine = view.contentDOM.querySelector('.cm-line');
      expect(firstLine?.textContent).toBe('加粗。 粗斜体。');
      expect(firstLine?.querySelector('.md-bold')).not.toBeNull();
      expect(firstLine?.querySelector('.md-bold.md-italic')).not.toBeNull();

      // treeWatcher 的异步重算完成后，DOM 仍须保持同一种预览形态。
      const stableHtml = firstLine?.innerHTML;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.contentDOM.querySelector('.cm-line')?.innerHTML).toBe(stableHtml);
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
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
  it('刚输完闭合标签时保留源码，让后续输入停在 HTML 右侧', () => {
    const doc = '<span style="color:blue">这是一个重点</span>';
    const atClosingBoundary = st(doc, doc.length);
    expect(ext(atClosingBoundary).some((x) => x.widget === 'HtmlWidget')).toBe(false);

    const continued = `${doc}继续输入`;
    const afterTyping = st(continued, continued.length);
    expect(ext(afterTyping).some((x) => x.widget === 'HtmlWidget')).toBe(true);
  });

  it.each([',', '，', '。', '","', '继续输入'])('真实 EditorView 连续输入 %s 后始终留在闭合标签右侧', (suffix) => {
    const html = '<span style="color:red">M</span>';
    const view = testView();
    try {
      // 模拟真人完成最后一个 >，再逐字符继续输入。
      typeText(view, html.slice(0, -1));
      typeText(view, '>');
      expect(view.state.doc.toString()).toBe(html);
      expect(view.state.selection.main.head).toBe(html.length);

      for (const character of suffix) typeText(view, character);

      expect(view.state.doc.toString()).toBe(html + suffix);
      expect(view.state.selection.main.head).toBe(html.length + suffix.length);
      expect(decos(view.state.field(livePreview), view.state.doc.length)
        .some((item) => item.widget === 'HtmlWidget' && item.from === 0 && item.to === html.length)).toBe(true);

      // 替换范围必须提供给 atomicRanges，让 CodeMirror 能修正 widget 边界的 DOM 输入位置。
      const atomic = view.state.facet(EditorView.atomicRanges).flatMap((provider) =>
        decos(provider(view) as DecorationSet, view.state.doc.length));
      expect(atomic).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: 0, to: html.length, widget: 'HtmlWidget' }),
      ]));
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  it('按真人编辑顺序补属性和内容后，逗号仍输入在完整标签右侧', () => {
    const opening = '<span style="color:red">';
    const html = `${opening}M</span>`;
    const view = testView();
    try {
      // 先分别输入开始、结束标签。
      typeText(view, '<span>');
      typeText(view, '</span>');

      // 回到开始标签内部补 style 属性。
      view.dispatch({ selection: EditorSelection.cursor('<span'.length) });
      typeText(view, ' style="color:red"');
      expect(view.state.doc.toString()).toBe(`${opening}</span>`);

      // 再回到两个标签之间输入内容。
      view.dispatch({ selection: EditorSelection.cursor(opening.length) });
      typeText(view, 'M');
      expect(view.state.doc.toString()).toBe(html);

      // 最后移动到完整标签右侧继续输入，光标不能跳回闭合标签左边。
      view.dispatch({ selection: EditorSelection.cursor(html.length) });
      typeText(view, ',');
      expect(view.state.doc.toString()).toBe(`${html},`);
      expect(view.state.selection.main.head).toBe(html.length + 1);

      const atomic = view.state.facet(EditorView.atomicRanges).flatMap((provider) =>
        decos(provider(view) as DecorationSet, view.state.doc.length));
      expect(atomic).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: 0, to: html.length, widget: 'HtmlWidget' }),
      ]));
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  it('中文输入法组合提交句号期间不折叠 HTML，提交后再恢复预览', async () => {
    const opening = '<span style="color:blue">';
    const html = `${opening}M</span>`;
    const view = testView();
    try {
      // 完整模拟用户顺序：先写标签，再回到开始标签补属性，最后写标签内容。
      typeText(view, '<span>');
      typeText(view, '</span>');
      view.dispatch({ selection: EditorSelection.cursor('<span'.length) });
      typeText(view, ' style="color:blue"');
      view.dispatch({ selection: EditorSelection.cursor(opening.length) });
      typeText(view, 'M');
      view.dispatch({ selection: EditorSelection.cursor(html.length) });

      view.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      view.dispatch({
        changes: { from: html.length, insert: '。' },
        selection: EditorSelection.cursor(html.length + 1),
        userEvent: 'input.type.compose.start',
      });

      expect(view.state.doc.toString()).toBe(`${html}。`);
      expect(view.state.selection.main.head).toBe(html.length + 1);
      expect(decos(view.state.field(livePreview), view.state.doc.length)
        .some((item) => item.widget === 'HtmlWidget')).toBe(false);

      view.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(view.state.doc.toString()).toBe(`${html}。`);
      expect(view.state.selection.main.head).toBe(html.length + 1);
      expect(decos(view.state.field(livePreview), view.state.doc.length)
        .some((item) => item.widget === 'HtmlWidget' && item.from === 0 && item.to === html.length)).toBe(true);
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
  });

  it('已有 HTML 预览时切换中文输入法并继续输入，不在源码和预览间闪烁', async () => {
    const html = '<span style="color:red">M</span>';
    const initial = `${html}。`;
    const view = testView(initial, initial.length);
    const hasHtmlPreview = () => decos(view.state.field(livePreview), view.state.doc.length)
      .some((item) => item.widget === 'HtmlWidget' && item.from === 0 && item.to === html.length);

    try {
      expect(hasHtmlPreview()).toBe(true);
      const previewDom = view.contentDOM.querySelector('.cm-widgetBuffer + span');
      expect(previewDom).not.toBeNull();
      view.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      expect(hasHtmlPreview()).toBe(true);

      view.dispatch({
        changes: { from: initial.length, insert: '中' },
        selection: EditorSelection.cursor(initial.length + 1),
        userEvent: 'input.type.compose.start',
      });

      // composition 期间必须沿用已有 HtmlWidget，否则每输入一个中文字符都会闪回源码。
      expect(view.state.doc.toString()).toBe(`${initial}中`);
      expect(hasHtmlPreview()).toBe(true);
      expect(view.contentDOM.querySelector('.cm-widgetBuffer + span')).toBe(previewDom);

      view.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(view.state.doc.toString()).toBe(`${initial}中`);
      expect(view.state.selection.main.head).toBe(initial.length + 1);
      expect(hasHtmlPreview()).toBe(true);
      expect(view.contentDOM.querySelector('.cm-widgetBuffer + span')).toBe(previewDom);
    } finally {
      view.destroy();
      view.dom.parentElement?.remove();
    }
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
  it('表格后的最后空行可保留为可编辑光标落点', () => {
    const s = st('| a |\n|---|\n', 0);
    // 第 2 行末尾的 block 不应吞掉第 3 个、也是最后一个空行。
    expect(blockEnd(s, 11, true)).toBe(11);
  });
});
