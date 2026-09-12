// 编辑器状态工厂（多标签共用同一 EditorView，每个标签一个 EditorState）
// 拆出此文件避免 tabs ↔ editor 循环依赖：tabs 建新状态、editor 注册编辑回调。
import { EditorState, EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, search } from '@codemirror/search';
import { markdownLang } from './markdown-lang';
import { themeExtension } from './theme';
import { livePreview, codeTokenField, documentIdentity, fontMetricsExtension, viewCapture, treeWatcher } from './live-preview';

// FR-8.2 行内标记快捷键
function wrap(view: EditorView, before: string, after = before): boolean {
  const state = view.state;
  const tr = state.changeByRange((r) => {
    const txt = state.doc.sliceString(r.from, r.to);
    return {
      changes: { from: r.from, to: r.to, insert: before + txt + after },
      range: EditorSelection.range(r.from + before.length, r.to + before.length),
    };
  });
  view.dispatch(tr);
  return true;
}

// 智能回车（FR-8.3 列表续接；引用块续接/退出；其他行纯换行，避免 auto-indent 破坏围栏/标题）
function smartEnter(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const text = line.text;
  const lm = text.match(/^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/);
  if (lm) {
    const markerRaw = lm[0];
    if (text.trim() === '' || text.trim() === markerRaw.trim()) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: '' }, selection: { anchor: line.from } });
      return true;
    }
    const marker = markerRaw.replace(/(\d+)\./, (_m, n) => (Number(n) + 1) + '.').replace(/\[[ xX]\]/, '[ ]');
    const insert = '\n' + marker;
    view.dispatch(state.changeByRange((r) => ({
      changes: { from: r.head, insert },
      range: EditorSelection.cursor(r.head + insert.length),
    })));
    return true;
  }
  // 引用块（FR-2.2）：Enter 自动续行（补齐 > 前缀），空引用行则退出引用
  const qm = text.match(/^(\s*>+\s?)(.*)$/);
  if (qm) {
    const prefix = qm[1]; // 引用前缀，如 "> " 或 "> > "
    const content = qm[2];
    if (content.trim() === '') {
      // 空引用行（仅有 > 无内容）：退出引用，换普通行
      view.dispatch({ changes: { from: line.from, to: line.to, insert: '' }, selection: { anchor: line.from } });
      return true;
    }
    // 有内容：续行，自动补齐 > 前缀
    const insert = '\n' + prefix;
    view.dispatch(state.changeByRange((r) => ({
      changes: { from: r.head, insert },
      range: EditorSelection.cursor(r.head + insert.length),
    })));
    return true;
  }
  view.dispatch(state.replaceSelection('\n'));
  return true;
}

// 插入表格（用户需求）：在光标处插入 3 列 2 行表格模板，光标定位到第一个单元格便于编辑。
// 模板含表头+分隔线+一行数据，满足 TableWidget 的 hasDataRows 判断（rowCount>=3）可立即渲染预览。
export function insertTable(view: EditorView): boolean {
  const table = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |';
  const tr = view.state.changeByRange((r) => ({
    changes: { from: r.from, to: r.to, insert: table },
    // 光标定位到第一个单元格内（"|" 后面，"列1" 开头），用户可直接输入替换占位文本
    range: EditorSelection.cursor(r.from + 1),
  }));
  view.dispatch(tr);
  return true;
}

// 表格中 Tab 键：移动到下一个单元格；末尾单元格移动到下一行第一个单元格；无下一行则添加新行
function tabInTable(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const text = line.text;

  // 必须是表格行（含 | 且非分隔线）
  if (!text.includes('|')) return false;
  if (/^\s*\|[\s:]*-+/.test(text)) return false; // 跳过分隔线行（| --- | --- |）

  // 解析 | 的位置（跳过转义 \|）
  const pipes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && (i === 0 || text[i - 1] !== '\\')) pipes.push(i);
  }
  if (pipes.length < 2) return false;

  // 光标在行内的相对位置
  const cursor = range.head - line.from;

  // 找到光标所在的单元格索引（默认最后一个单元格）
  let cellIndex = pipes.length - 2;
  for (let i = 0; i < pipes.length - 1; i++) {
    if (cursor >= pipes[i] && cursor < pipes[i + 1]) { cellIndex = i; break; }
  }

  // 同一行下一个单元格
  if (cellIndex < pipes.length - 2) {
    const nextIdx = cellIndex + 1;
    const cellStart = pipes[nextIdx] + 1;
    const cellContent = text.slice(cellStart, pipes[nextIdx + 1]);
    const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
    view.dispatch({ selection: { anchor: line.from + cellStart + leadingSpaces } });
    return true;
  }

  // 最后一个单元格：移动到下一行第一个单元格（跳过分隔线）
  const lineNum = line.number;
  for (let n = lineNum + 1; n <= state.doc.lines; n++) {
    const nextLine = state.doc.line(n);
    if (!nextLine.text.includes('|')) break; // 表格结束
    if (/^\s*\|[\s:]*-+/.test(nextLine.text)) continue; // 跳过分隔线
    const firstPipe = nextLine.text.indexOf('|');
    const secondPipe = nextLine.text.indexOf('|', firstPipe + 1);
    if (secondPipe > firstPipe) {
      const cellStart = firstPipe + 1;
      const cellContent = nextLine.text.slice(cellStart, secondPipe);
      const leadingSpaces = cellContent.match(/^\s*/)?.[0].length ?? 0;
      view.dispatch({ selection: { anchor: nextLine.from + cellStart + leadingSpaces } });
      return true;
    }
  }

  // 没有下一行表格：添加新行（保持列数）
  const colCount = pipes.length - 1;
  const newRow = '|' + '  |'.repeat(colCount);
  const insertPos = line.to;
  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newRow },
    selection: { anchor: insertPos + 1 }, // 第一个单元格内
  });
  return true;
}

const mdKeymap = [
  { key: 'Enter', run: smartEnter, precedence: 'high' },
  { key: 'Tab', run: tabInTable, precedence: 'high' }, // 表格中 Tab 移动到下一单元格
  { key: 'Mod-b', run: (v: EditorView) => wrap(v, '**') },
  { key: 'Mod-i', run: (v: EditorView) => wrap(v, '*') },
  { key: 'Mod-k', run: (v: EditorView) => { v.dispatch(v.state.replaceSelection('[链接文本](url)')); return true; } },
  { key: 'Mod-f', run: openSearchPanel }, // FR-8.4 查找替换
];

// 编辑回调：由入口装配（多标签路由用）
export type EditHandler = (update: ViewUpdate) => void;
let editHandler: EditHandler | null = null;
export function setEditHandler(fn: EditHandler): void { editHandler = fn; }

// 标签切换与分屏镜像会产生内部更新；按视图抑制一次，避免误标脏或循环同步。
const suppressedViews = new WeakSet<EditorView>();
export function suppressNextUpdateFor(view: EditorView): void { suppressedViews.add(view); }

export function createEditorState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      Prec.highest(keymap.of(mdKeymap)),
      markdownLang(),
      themeExtension(),
      fontMetricsExtension(),
      documentIdentity,
      viewCapture,
      treeWatcher,
      livePreview,
      codeTokenField,
      EditorView.lineWrapping,
      EditorView.updateListener.of((vu) => {
        if (suppressedViews.delete(vu.view)) return;
        if (editHandler) editHandler(vu);
      }),
    ],
  });
}

export function createEditor(parent: HTMLElement, doc: string): EditorView {
  return new EditorView({ parent, state: createEditorState(doc) });
}
