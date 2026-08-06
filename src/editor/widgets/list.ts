// 列表标记 Widget（需求 FR-2.3：无序列表圆点 / 有序列表数字，非活跃行渲染）
import { WidgetType } from '@codemirror/view';

export class ListMarkWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'md-list-mark';
    span.textContent = this.text;
    return span;
  }
  eq(o: WidgetType): boolean {
    return o instanceof ListMarkWidget && o.text === this.text;
  }
  ignoreEvent(): boolean { return true; }
}
