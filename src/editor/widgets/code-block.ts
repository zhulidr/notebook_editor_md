// 代码块 Widget：Shiki 高亮 + IDEA Darcula 深色卡片（ARCHITECTURE.md §4，需求 FR-4）
// 注意：代码块已改为「逐行渲染」（见 live-preview.ts），此文件仅保留右上角语言标签 + 复制按钮
// 的悬浮 Widget。逐行渲染保持源码行可导航 / 可选 / 对齐行号 / 显示行号。
import { WidgetType, type EditorView } from '@codemirror/view';

export class CodeBlockLabelWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly code: string,
  ) { super(); }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'md-code-float';

    const label = document.createElement('span');
    label.className = 'md-code-lang';
    label.textContent = this.lang || 'text';

    const btn = document.createElement('button');
    btn.className = 'md-code-copy';
    btn.textContent = '复制';
    btn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(this.code);
      btn.textContent = '已复制';
      setTimeout(() => (btn.textContent = '复制'), 1200);
    };

    wrap.append(label, btn);
    return wrap;
  }
  eq(o: WidgetType): boolean {
    return o instanceof CodeBlockLabelWidget && o.lang === this.lang && o.code === this.code;
  }
  ignoreEvent(): boolean { return false; }
}
