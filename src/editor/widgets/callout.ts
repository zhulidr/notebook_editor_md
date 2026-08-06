// Callout 折叠标题 Widget（Obsidian 风格 callout：> [!TYPE]- 可折叠）
import { WidgetType, type EditorView } from '@codemirror/view';

export interface CalloutState { [key: string]: boolean; }

export class CalloutHeaderWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly title: string,
    readonly collapsible: boolean,
    readonly collapsed: boolean,
    readonly blockKey: string,
    readonly view: EditorView,
    readonly onToggle: (key: string) => void,
  ) { super(); }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-callout-header';
    wrap.dataset.type = this.type.toLowerCase();

    const toggle = document.createElement('span');
    toggle.className = 'md-callout-toggle';
    toggle.textContent = this.collapsible ? (this.collapsed ? '▸' : '▾') : '';
    if (this.collapsible) {
      toggle.onclick = (e) => {
        e.stopPropagation();
        this.onToggle(this.blockKey);
      };
    }

    const badge = document.createElement('span');
    badge.className = 'md-callout-type';
    badge.textContent = this.type;

    const title = document.createElement('span');
    title.className = 'md-callout-title';
    title.textContent = this.title;

    wrap.append(toggle, badge, title);
    return wrap;
  }
  eq(o: WidgetType): boolean {
    return o instanceof CalloutHeaderWidget &&
      o.type === this.type && o.title === this.title &&
      o.collapsible === this.collapsible && o.collapsed === this.collapsed &&
      o.blockKey === this.blockKey;
  }
  // 拦截点击事件，避免点击折叠箭头时光标移入引用块（导致退回首源码）
  ignoreEvent(): boolean { return true; }
}
