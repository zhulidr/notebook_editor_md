// 链接 Widget（需求 FR-1.3 隐藏标记符 + FR-2.4 点击打开外部链接）
// 锚点链接（#开头）在文档内滚动，不打开外部页面。
import { WidgetType } from '@codemirror/view';
import { isSafeExternalUrl, openExternal } from '../../platform';

export class LinkWidget extends WidgetType {
  constructor(readonly text: string, readonly url: string) { super(); }
  toDOM(): HTMLElement {
    const a = document.createElement('a');
    a.className = 'md-link';
    a.textContent = this.text;
    a.href = this.url.startsWith('#') ? this.url : '#';
    a.title = this.url;
    a.onclick = (e) => {
      e.preventDefault();
      const u = this.url;
      if (u.startsWith('#')) {
        // 文档内锚点：查找同 id 元素滚动到可视区（回到顶部→滚动到文档开头）
        const id = u.slice(1);
        const target = id
          ? document.getElementById(id)
          : null;
        const scroller = document.querySelector('.cm-scroller') as HTMLElement | null;
        if (id === 'top' || id === '') {
          scroller?.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (scroller) {
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      if (!isSafeExternalUrl(u)) return;
      void openExternal(u);
    };
    return a;
  }
  eq(o: WidgetType): boolean {
    return o instanceof LinkWidget && o.text === this.text && o.url === this.url;
  }
  ignoreEvent(): boolean { return false; }
}
