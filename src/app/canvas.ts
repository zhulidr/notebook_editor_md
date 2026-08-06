// Canvas 白板渲染（用户需求：支持 canvas）
// Obsidian .canvas 文件是 JSON：{nodes:[{id,x,y,width,height,type,text,color}], edges:[{id,fromNode,toNode,label}]}
// 打开 .canvas 文件时在编辑器上方覆盖交互白板：节点可拖动、连线绘制、点击节点可查看内容。
import type { EditorView } from '@codemirror/view';

interface CanvasNode { id: string; x: number; y: number; width: number; height: number; type?: string; text?: string; color?: string; label?: string; }
interface CanvasEdge { id: string; fromNode: string; toNode: string; label?: string; color?: string; }
interface CanvasData { nodes?: CanvasNode[]; edges?: CanvasEdge[]; }

export function isCanvasJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{') || !t.includes('"nodes"')) return false;
  try {
    const d = JSON.parse(t) as CanvasData;
    return Array.isArray(d.nodes);
  } catch { return false; }
}

// 判断文件名是否为 .canvas（含 .canvas 后缀）
export function isCanvasFile(name: string): boolean {
  return /\.canvas$/i.test(name);
}

let overlay: HTMLElement | null = null;
let onMove: ((e: MouseEvent) => void) | null = null;
let onUp: (() => void) | null = null;

export function closeCanvas(): void {
  if (overlay) { overlay.remove(); overlay = null; }
  if (onMove) { window.removeEventListener('mousemove', onMove); onMove = null; }
  if (onUp) { window.removeEventListener('mouseup', onUp); onUp = null; }
}

// 渲染白板到编辑器上层（editorEl 容器）。nodes 拖动 + edges 连线。
export function renderCanvas(json: string, editorEl: HTMLElement, view: EditorView): void {
  let data: CanvasData;
  try { data = JSON.parse(json) as CanvasData; }
  catch { return; }
  closeCanvas();

  const nodes = (data.nodes ?? []).map((n, i) => ({ ...n, y: n.y ?? i * 120, x: n.x ?? (i % 4) * 220 }));
  const edges = data.edges ?? [];

  overlay = document.createElement('div');
  overlay.className = 'canvas-overlay';
  overlay.innerHTML = '';
  const toolbar = document.createElement('div');
  toolbar.className = 'canvas-toolbar';
  const info = document.createElement('span');
  info.textContent = `Canvas · ${nodes.length} 节点 / ${edges.length} 连线`;
  const btnSrc = document.createElement('button');
  btnSrc.textContent = '查看源码';
  btnSrc.onclick = () => closeCanvas();
  toolbar.append(info, btnSrc);
  overlay.appendChild(toolbar);

  const board = document.createElement('div');
  board.className = 'canvas-board';

  const elMap = new Map<string, HTMLElement>();

  // 节点
  for (const n of nodes) {
    const el = document.createElement('div');
    el.className = 'canvas-node';
    el.dataset.id = n.id;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${n.width || 180}px`;
    el.style.minHeight = `${n.height || 60}px`;
    if (n.color && /^#[0-9a-f]{6}$/i.test(n.color)) {
      el.style.borderColor = n.color;
      el.style.borderLeftColor = n.color;
    }
    const label = document.createElement('div');
    label.className = 'canvas-node-label';
    label.textContent = n.label || '';
    const body = document.createElement('div');
    body.className = 'canvas-node-body';
    // 节点 text 是 markdown：简单渲染标题/粗体/任务，其余纯文本
    body.innerHTML = renderNodeText(n.text || '');
    el.append(label, body);
    board.appendChild(el);
    elMap.set(n.id, el);
  }

  // 连线（SVG 覆盖）
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'canvas-svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  board.appendChild(svg);

  function drawEdges(): void {
    svg.innerHTML = '';
    for (const e of edges) {
      const a = elMap.get(e.fromNode);
      const b = elMap.get(e.toNode);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const brr = board.getBoundingClientRect();
      const x1 = ar.left - brr.left + ar.width / 2;
      const y1 = ar.top - brr.top + ar.height / 2;
      const x2 = br.left - brr.left + br.width / 2;
      const y2 = br.top - brr.top + br.height / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (x1 + x2) / 2;
      path.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', e.color && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#9ca3af');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
      if (e.label) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String((x1 + x2) / 2));
        t.setAttribute('y', String((y1 + y2) / 2 - 4));
        t.setAttribute('fill', '#6b7280');
        t.setAttribute('font-size', '11');
        t.setAttribute('text-anchor', 'middle');
        t.textContent = e.label;
        svg.appendChild(t);
      }
    }
  }

  // 拖动节点
  let dragEl: HTMLElement | null = null;
  let dx = 0, dy = 0;
  board.addEventListener('mousedown', (e) => {
    const node = (e.target as HTMLElement).closest('.canvas-node') as HTMLElement | null;
    if (!node || (e.target as HTMLElement).closest('.canvas-node-body')) return;
    dragEl = node;
    const rect = node.getBoundingClientRect();
    dx = e.clientX - rect.left;
    dy = e.clientY - rect.top;
    node.style.zIndex = '10';
    e.preventDefault();
  });
  onMove = (e) => {
    if (!dragEl) return;
    const br = board.getBoundingClientRect();
    dragEl.style.left = `${e.clientX - br.left - dx}px`;
    dragEl.style.top = `${e.clientY - br.top - dy}px`;
    drawEdges();
  };
  onUp = () => { dragEl = null; };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  overlay.appendChild(board);
  editorEl.appendChild(overlay);
  requestAnimationFrame(drawEdges);
}

// 节点 markdown 文本 → HTML（子集：标题/粗体/斜体/任务/换行，防 XSS）
function renderNodeText(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 行内标记：转义后应用，标记符号不受影响
  const inline = (s: string) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const tm = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (tm) {
      const checked = tm[1].toLowerCase() === 'x';
      out.push(`<div class="canvas-task"><input type="checkbox" ${checked ? 'checked' : ''} disabled> <span>${inline(tm[2])}</span></div>`);
      continue;
    }
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { out.push(`<div class="canvas-h canvas-h${hm[1].length}">${inline(hm[2])}</div>`); continue; }
    out.push(`<div>${inline(line)}</div>`);
  }
  return out.join('');
}
