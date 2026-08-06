// Mermaid 图表 Widget：```mermaid 代码块渲染为 SVG 图（用户需求：支持 mermaid）
// 静态 import：Tauri/WebView2 自定义协议下运行时动态 import() 会挂起（见 highlight/shiki.ts 注释）。
import { WidgetType, type EditorView } from '@codemirror/view';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

let seq = 0;

export class MermaidWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly from: number,
    readonly view: EditorView,
  ) { super(); }

  toDOM(): HTMLElement {
    const widget = this;
    const wrap = document.createElement('div');
    wrap.className = 'md-mermaid';
    const id = `md-mermaid-${++seq}`;

    const placeholder = document.createElement('div');
    placeholder.className = 'md-mermaid-pending';
    placeholder.textContent = '图表渲染中…';
    wrap.appendChild(placeholder);

    // 点击回到源码（FR-1.5）
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      widget.view.dispatch({ selection: { anchor: widget.from } });
      widget.view.focus();
    });

    void (async () => {
      try {
        const { svg } = await mermaid.render(id, this.src);
        placeholder.remove();
        const holder = document.createElement('div');
        holder.innerHTML = svg;
        wrap.appendChild(holder);
      } catch (e) {
        placeholder.textContent = '图表渲染失败';
        const err = document.createElement('div');
        err.className = 'md-mermaid-error';
        err.textContent = String((e as Error).message ?? e).slice(0, 300);
        wrap.appendChild(err);
      }
    })();

    return wrap;
  }
  eq(o: WidgetType): boolean {
    return o instanceof MermaidWidget && o.src === this.src && o.from === this.from;
  }
  ignoreEvent(): boolean { return true; }
}
