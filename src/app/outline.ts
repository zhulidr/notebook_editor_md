// 大纲目录（候选 M4）：从文档抽取标题，点击跳转
import { EditorView } from '@codemirror/view';

interface Heading { level: number; text: string; pos: number; }

let view: EditorView;
let panel: HTMLElement;
let visible = false;

export function initOutline(v: EditorView): void {
  view = v;
  panel = document.getElementById('outline') as HTMLElement;
}

export function toggleOutline(): void {
  visible = !visible;
  panel.classList.toggle('open', visible);
  if (visible) refreshOutline();
}

export function refreshOutline(): void {
  if (!view || !visible) return;
  const heads = buildOutline(view);
  panel.innerHTML = '';
  if (!heads.length) {
    panel.innerHTML = '<p class="empty">无标题</p>';
    return;
  }
  for (const h of heads) {
    const el = document.createElement('div');
    el.className = `outline-item outline-h${h.level}`;
    el.textContent = h.text || '(空标题)';
    el.title = h.text;
    el.onclick = () => {
      view.dispatch({
        selection: { anchor: h.pos },
        effects: EditorView.scrollIntoView(h.pos, { y: 'center' }),
      });
      view.focus();
    };
    panel.appendChild(el);
  }
}

function buildOutline(v: EditorView): Heading[] {
  const heads: Heading[] = [];
  const doc = v.state.doc;
  // 用 doc.line 获取行起始偏移，正确处理 CRLF（手动累加 line.length+1 会偏）
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const m = line.text.match(/^(#{1,6})\s+(.*)$/);
    if (m) heads.push({ level: m[1].length, text: m[2].replace(/[*`]/g, '').trim(), pos: line.from });
  }
  return heads;
}
