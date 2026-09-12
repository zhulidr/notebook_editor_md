// 图片 Widget（ARCHITECTURE.md §4，需求 FR-6.1~6.3）
// 点击图片回到源码（FR-1.5），使光标可重新定位到图片语法处。
import { WidgetType, type EditorView } from '@codemirror/view';

export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly from: number,
  ) { super(); }
  toDOM(view: EditorView): HTMLElement {
    const widget = this;
    const wrap = document.createElement('span');
    wrap.className = 'md-image';
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: widget.from } });
      view.focus();
    });
    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    img.onerror = () => {
      wrap.innerHTML = '';
      const ph = document.createElement('span');
      ph.className = 'md-img-broken';
      ph.textContent = `[图片] ${this.alt || this.url}`;
      wrap.appendChild(ph);
    };
    wrap.appendChild(img);
    return wrap;
  }
  eq(o: WidgetType): boolean {
    return o instanceof ImageWidget && o.alt === this.alt && o.url === this.url && o.from === this.from;
  }
  ignoreEvent(): boolean { return true; }
}
