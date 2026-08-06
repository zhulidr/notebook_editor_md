// 表格 Widget（ARCHITECTURE.md §4，需求 FR-5）
// FR-5.3 双击单元格跳回源码；FR-5.5 渲染态直接编辑单元格并回写源码（blur 时提交一次）
import { WidgetType, type EditorView } from '@codemirror/view';
import katex from 'katex';

interface LineRange { abs: number; text: string; }

// 单元格源码区间（绝对偏移）：可编辑内容 = [from, to) = 去首尾空白后的文本区间
interface CellSpan { text: string; from: number; to: number; }

function lineRanges(src: string, base: number): LineRange[] {
  const out: LineRange[] = [];
  let start = 0;
  for (let i = 0; i <= src.length; i++) {
    if (i === src.length || src[i] === '\n') {
      out.push({ abs: base + start, text: src.slice(start, i) });
      start = i + 1;
    }
  }
  return out;
}

function parseRow(line: string, lineAbsStart: number): CellSpan[] {
  const cells: CellSpan[] = [];
  const n = line.length;
  let i = 0;
  while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
  if (i < n && line[i] === '|') i++;
  let cellStart = i;
  while (i <= n) {
    if (i === n || line[i] === '|') {
      const raw = line.slice(cellStart, i);
      if (raw !== '') { // 始终创建 cell（包括只有空格的空单元格），使空单元格可编辑
        const trimmed = raw.trim();
        const contStartRel = raw.search(/\S/);
        const contStart = contStartRel < 0 ? 0 : contStartRel;
        let contentEnd = raw.length;
        for (let j = raw.length - 1; j >= 0; j--) {
          if (raw[j] !== ' ' && raw[j] !== '\t') { contentEnd = j + 1; break; }
        }
        cells.push({
          text: trimmed,
          from: lineAbsStart + cellStart + contStart,
          to: lineAbsStart + cellStart + contentEnd,
        });
      }
      cellStart = i + 1;
    }
    i++;
  }
  return cells;
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
}

function alignOf(cell: string): string {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  if (l && r) return 'center';
  if (r) return 'right';
  if (l) return 'left';
  return 'left';
}

function inlineHtml(text: string): string {
  // 单元格内支持行内代码 `…` 与行内公式 $…$（FR-5.4）；粗体/斜体内容需转义防 XSS
  let out = text.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
  out = out.replace(/\$([^\$\n]+?)\$/g, (_, t) => {
    try { return katex.renderToString(t, { throwOnError: false }); }
    catch { return esc(t); }
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${esc(c)}</strong>`)
           .replace(/\*([^*]+)\*/g, (_, c) => `<em>${esc(c)}</em>`);
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 保留原文本的外层 Markdown 行内标记（**b** / *i* / `c` / $m$），套用到编辑后的纯文本上。
// 单元格 contentEditable 显示的是渲染结果，用户编辑只改可见文本，标记符号不可见、不应丢失。
export function preserveMarkers(orig: string, edited: string): string {
  const patterns: { re: RegExp; wrap: (s: string) => string }[] = [
    { re: /^\*\*\*([\s\S]+)\*\*\*$/, wrap: (s) => `***${s}***` },
    { re: /^```([\s\S]+)```$/, wrap: (s) => '```' + s + '```' },
    { re: /^`([^`]+)`$/, wrap: (s) => `\`${s}\`` },
    { re: /^\*\*([\s\S]+)\*\*$/, wrap: (s) => `**${s}**` },
    { re: /^\*([\s\S]+)\*$/, wrap: (s) => `*${s}*` },
    { re: /^\$([^\$\n]+)\$$/, wrap: (s) => `$${s}$` },
    { re: /^==([^=\n]+)==$/, wrap: (s) => `==${s}==` },
  ];
  for (const p of patterns) {
    const m = orig.match(p.re);
    if (m && m[1] !== undefined) return p.wrap(edited);
  }
  return edited;
}

export class TableWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly from: number,
    readonly view: EditorView,
  ) { super(); }

  // FR-5.5：编辑后的单元格内容回写源码；保留原 Markdown 行内标记，避免反复编辑后标记被剥光
  // rowIdx 为表格内行索引（0=表头，1=分隔线，2+=数据行），用于 commit 时从当前文档重新定位偏移
  private commit(cell: HTMLElement, rowIdx: number, colIdx: number, origText: string): void {
    const raw = cell.innerText ?? '';
    const next = raw.trim();
    if (next === origText) return;
    // 从当前文档重新定位单元格偏移（用户编辑其他单元格后，widget 创建时的 span.from/to 已失效）
    const doc = this.view.state.doc;
    const startLine = doc.lineAt(this.from);
    const lineCount = this.src.split('\n').filter((l) => l.trim() !== '').length;
    let collected = 0;
    let targetLine = startLine;
    for (let n = startLine.number; n <= doc.lines && collected < lineCount; n++) {
      const line = doc.line(n);
      if (line.text.trim() === '' && collected > 0) break;
      if (line.text.trim() !== '') {
        if (collected === rowIdx) { targetLine = line; break; }
        collected++;
      }
    }
    const spans = parseRow(targetLine.text, targetLine.from);
    const span = spans[colIdx];
    if (!span || span.from >= span.to) return;
    const insert = preserveMarkers(origText, next);
    this.view.dispatch({ changes: { from: span.from, to: span.to, insert } });
  }

  toDOM(): HTMLElement {
    const widget = this;
    const lines = lineRanges(this.src, this.from).filter((l) => l.text.trim() !== '');
    const table = document.createElement('table');
    table.className = 'md-table';
    if (lines.length < 2) {
      const div = document.createElement('div');
      div.textContent = this.src;
      return div;
    }
    const aligns = parseRow(lines[1].text, lines[1].abs).map((c) => alignOf(c.text));

    function attrs(cell: HTMLElement, spans: CellSpan[], colIdx: number, rowIdx: number, editable: boolean): void {
      cell.style.textAlign = aligns[colIdx] || 'left';
      if (!editable || !spans[colIdx]) return;
      cell.contentEditable = 'true';
      cell.tabIndex = 0;
      const span = spans[colIdx];
      const origText = span.text;
      // capture 阶段拦截，确保在 CodeMirror keymap 之前处理 Tab
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cell.innerText = origText;
          cell.blur();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopImmediatePropagation();
          // 先移动焦点再提交（blur 会触发 commit）
          const allCells = Array.from(table.querySelectorAll('th, td')).filter(
            (el) => (el as HTMLElement).contentEditable === 'true'
          ) as HTMLElement[];
          const cellIdx = allCells.indexOf(cell);
          const nextIdx = e.shiftKey ? cellIdx - 1 : cellIdx + 1;
          if (nextIdx >= 0 && nextIdx < allCells.length) {
            (allCells[nextIdx] as HTMLElement).focus();
          } else {
            cell.blur();
          }
        }
      }, true);
      cell.addEventListener('blur', () => widget.commit(cell, rowIdx, colIdx, origText));
    }

    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    const hdrSpans = parseRow(lines[0].text, lines[0].abs);
    splitRow(lines[0].text).forEach((c, i) => {
      const th = document.createElement('th');
      th.innerHTML = inlineHtml(c);
      attrs(th, hdrSpans, i, 0, true);
      thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 2; i < lines.length; i++) {
      const spans = parseRow(lines[i].text, lines[i].abs);
      const tr = document.createElement('tr');
      splitRow(lines[i].text).forEach((c, j) => {
        const td = document.createElement('td');
        td.innerHTML = inlineHtml(c);
        attrs(td, spans, j, i, true);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // FR-5.3 双击渲染单元格 → 光标跳到对应源码文本处
    table.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('th, td');
      if (!cell || this.view.state.doc.length === 0) return;
      const rect = (cell as HTMLElement).getBoundingClientRect();
      // 用子元素行偏移近似：直接定位到该行源码
      const rowEl = cell.parentElement as HTMLElement;
      const rowParent = rowEl.parentElement;
      if (!rowParent) return;
      const trIdx = Array.prototype.indexOf.call(rowParent.children, rowEl);
      const useBody = rowParent === tbody;
      const lineIdx = useBody ? 2 + trIdx : 0;
      if (lineIdx < lines.length) {
        const spans = parseRow(lines[lineIdx].text, lines[lineIdx].abs);
        const colIdx = Array.prototype.indexOf.call(rowEl.children, cell);
        const span = spans[colIdx];
        if (span) {
          const pos = Math.min(span.from + (span.to - span.from) / 2, this.view.state.doc.length);
          this.view.dispatch({ selection: { anchor: Math.floor(pos) } });
          this.view.focus();
        }
      }
    });

    // 添加行/列按钮：悬浮时显示，点击添加新行/列
    const wrapper = document.createElement('div');
    wrapper.className = 'md-table-wrapper';
    wrapper.appendChild(table);

    const colCount = splitRow(lines[0].text).length;

    // 从编辑器实时读取表格实际源码（commit 后 widget.src 过期，用行数定位实际范围）
    function readCurTable(): { src: string; end: number } {
      const doc = widget.view.state.doc;
      const startLine = doc.lineAt(widget.from);
      const lineCount = widget.src.split('\n').filter((l) => l.trim() !== '').length;
      let end = widget.from;
      let collected = 0;
      for (let n = startLine.number; n <= doc.lines && collected < lineCount; n++) {
        const line = doc.line(n);
        if (line.text.trim() === '' && collected > 0) break;
        if (line.text.trim() !== '') collected++;
        end = line.to;
      }
      return { src: doc.sliceString(widget.from, end), end };
    }

    // 添加行按钮：表格底部居中，悬浮显示 CSS 三角形
    const addRowBtn = document.createElement('div');
    addRowBtn.className = 'md-table-add md-table-add-row';
    addRowBtn.title = '添加行';
    addRowBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 先提交当前编辑的单元格（blur 触发 commit，同步 dispatch 更新文档）
      const focused = document.activeElement as HTMLElement;
      if (focused && focused.contentEditable === 'true') focused.blur();
      const { end } = readCurTable();
      const newRow = '|' + '  |'.repeat(colCount);
      widget.view.dispatch({ changes: { from: end, insert: '\n' + newRow } });
    });
    wrapper.appendChild(addRowBtn);

    // 添加列按钮：表格右侧居中，悬浮显示 CSS 三角形
    const addColBtn = document.createElement('div');
    addColBtn.className = 'md-table-add md-table-add-col';
    addColBtn.title = '添加列';
    addColBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 先提交当前编辑的单元格（blur 触发 commit，同步 dispatch 更新文档）
      const focused = document.activeElement as HTMLElement;
      if (focused && focused.contentEditable === 'true') focused.blur();
      const { src: curSrc, end } = readCurTable();
      const newSrc = curSrc.split('\n').map((line: string) => {
        if (line.trim() === '') return line;
        const lastPipe = line.lastIndexOf('|');
        if (lastPipe < 0) return line;
        const isSeparator = /^\s*\|[\s:|-]*-+/.test(line);
        const newCell = isSeparator ? ' --- |' : '  |';
        return line.slice(0, lastPipe + 1) + newCell + line.slice(lastPipe + 1);
      }).join('\n');
      widget.view.dispatch({ changes: { from: widget.from, to: end, insert: newSrc } });
    });
    wrapper.appendChild(addColBtn);

    return wrapper;
  }
  eq(o: WidgetType): boolean { return o instanceof TableWidget && o.src === this.src && o.from === this.from; }
  ignoreEvent(): boolean { return true; }
}
