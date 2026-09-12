// KaTeX 公式 Widget（ARCHITECTURE.md §4，需求 FR-3）
// 点击渲染结果回到源码（FR-1.5/FR-3.4），使光标可重新定位到公式内。
import { WidgetType, type EditorView } from '@codemirror/view';
import katex from 'katex';

const cache = new Map<string, string>();

function render(tex: string, display: boolean): string {
  const key = (display ? 'b' : 'i') + '|' + tex;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        errorColor: '#cc0000',
      });
    } catch {
      html = `<span class="md-math-error">${escapeHtml(tex)}</span>`;
    }
    cache.set(key, html);
  }
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class InlineMathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly from: number,
  ) { super(); }
  toDOM(view: EditorView): HTMLElement {
    const widget = this;
    const span = document.createElement('span');
    span.className = 'md-math-inline';
    span.innerHTML = render(this.tex, false);
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: widget.from } });
      view.focus();
    });
    return span;
  }
  eq(o: WidgetType): boolean { return o instanceof InlineMathWidget && o.tex === this.tex && o.from === this.from; }
  ignoreEvent(): boolean { return true; }
}

export class BlockMathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly from: number,
  ) { super(); }
  toDOM(view: EditorView): HTMLElement {
    const widget = this;
    const div = document.createElement('div');
    div.className = 'md-math-block';
    div.innerHTML = render(this.tex, true);
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: widget.from } });
      view.focus();
    });
    return div;
  }
  eq(o: WidgetType): boolean { return o instanceof BlockMathWidget && o.tex === this.tex && o.from === this.from; }
  ignoreEvent(): boolean { return true; }
}
