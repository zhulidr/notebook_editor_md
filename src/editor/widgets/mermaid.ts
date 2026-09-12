// Mermaid 图表 Widget：```mermaid 代码块渲染为 SVG 图（用户需求：支持 mermaid）
// 静态 import：Tauri/WebView2 自定义协议下运行时动态 import() 会挂起（见 highlight/shiki.ts 注释）。
import { WidgetType, type EditorView } from '@codemirror/view';
import mermaid from 'mermaid';

// 图表内容来自 Markdown 文件。strict 会编码 HTML 并禁用图内点击链接，避免图表
// 成为绕过 Markdown HTML 白名单的第二条注入路径。
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

let seq = 0;

export class MermaidWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly from: number,
  ) { super(); }

  toDOM(view: EditorView): HTMLElement {
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
      view.dispatch({ selection: { anchor: widget.from } });
      view.focus();
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
