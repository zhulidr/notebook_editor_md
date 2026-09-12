// 当前活动编辑区的大纲导航。
import { EditorView } from '@codemirror/view';

interface Heading { level: number; text: string; pos: number; }

let view: EditorView;
let panel: HTMLElement;
let list: HTMLElement;
let visible = true;

export function initOutline(initialView: EditorView): void {
  view = initialView;
  panel = document.getElementById('outline') as HTMLElement;
  list = document.getElementById('outline-list') as HTMLElement;
  panel.classList.toggle('open', visible);
  document.getElementById('app')?.classList.toggle('outline-open', visible);
}

export function setOutlineView(nextView: EditorView): void {
  view = nextView;
  refreshOutline();
}

export function toggleOutline(): void {
  visible = !visible;
  panel.classList.toggle('open', visible);
  document.getElementById('app')?.classList.toggle('outline-open', visible);
  if (visible) refreshOutline();
}

export function refreshOutline(): void {
  if (!view || !visible) return;
  const headings = buildOutline(view);
  const cursor = view.state.selection.main.head;
  let currentIndex = -1;
  headings.forEach((heading, index) => {
    if (heading.pos <= cursor) currentIndex = index;
  });
  list.innerHTML = '';
  if (!headings.length) {
    list.innerHTML = '<p class="empty">当前文档没有标题</p>';
    return;
  }
  headings.forEach((heading, index) => {
    const item = document.createElement('div');
    item.className = `outline-item outline-h${heading.level}${index === currentIndex ? ' current' : ''}`;
    item.textContent = heading.text || '(空标题)';
    item.title = heading.text;
    item.onclick = () => {
      view.dispatch({
        selection: { anchor: heading.pos },
        effects: EditorView.scrollIntoView(heading.pos, { y: 'center' }),
      });
      view.focus();
      refreshOutline();
    };
    list.appendChild(item);
  });
}

function buildOutline(editorView: EditorView): Heading[] {
  const headings: Heading[] = [];
  const doc = editorView.state.doc;
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    const match = line.text.match(/^(#{1,6})\s+(.*)$/);
    if (match) headings.push({
      level: match[1].length,
      text: match[2].replace(/[*`]/g, '').trim(),
      pos: line.from,
    });
  }
  return headings;
}
