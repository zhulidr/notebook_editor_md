// 任务列表 checkbox Widget（ARCHITECTURE.md §4，需求 FR-6.4：点击回写源码，可撤销）
import { WidgetType, type EditorView } from '@codemirror/view';

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly checked: boolean,
    readonly view: EditorView,
  ) { super(); }

  toDOM(): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'md-checkbox';
    box.checked = this.checked;
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = this.checked ? '[ ]' : '[x]';
      this.view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
    });
    return box;
  }
  eq(o: WidgetType): boolean {
    return o instanceof CheckboxWidget && o.checked === this.checked && o.from === this.from;
  }
  // 允许 checkbox 接收点击（不交给编辑器处理）
  ignoreEvent(): boolean { return true; }
}
