// 多标签（需求 FR-7.8）：单 EditorView + 每标签一个 EditorState
// 切换标签 = view.setState(tab.state)，见 state.ts 的 setSuppressNextUpdate 抑制误触发。
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { createEditorState, setSuppressNextUpdate } from '../editor/cm/state';
import { store } from './state';
import { cancelAutosave } from './autosave';

export interface Tab {
  id: number;
  name: string;
  path: string | null;
  dirty: boolean;
  state: EditorState;
}

const tabs: Tab[] = [];
let currentId: number | null = null;
let seq = 1;

export function currentTab(): Tab | null {
  return tabs.find((t) => t.id === currentId) ?? null;
}

export function tabList(): readonly Tab[] {
  return tabs;
}

// 把当前标签的 path/name/dirty 同步进 store（状态栏/标题等 UI 订阅 store）
function syncCurrentToStore(): void {
  const t = currentTab();
  if (t) store.set({ path: t.path, name: t.name, dirty: t.dirty });
}

function activate(view: EditorView, id: number): void {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  currentId = id;
  cancelAutosave(); // 切换标签：取消未决的自动保存快照，避免写错路径
  setSuppressNextUpdate(true);
  view.setState(t.state);
  syncCurrentToStore();
}

// 启动首标签：复用已创建的 EditorView 当前状态（main.ts 已用空文档创建视图）
export function registerFirstTab(view: EditorView, name: string, path: string | null): void {
  const t: Tab = { id: seq++, name, path, dirty: false, state: view.state };
  tabs.push(t);
  currentId = t.id;
  syncCurrentToStore();
}

// 标记当前标签脏/干净（编辑回调与自动保存调用）
export function setCurrentDirty(dirty: boolean): void {
  const t = currentTab();
  if (!t || t.dirty === dirty) return;
  t.dirty = dirty;
  store.set({ dirty });
}

// 编辑后同步当前标签的状态引用（CM 状态不可变，dispatch 产生新 state，须回写 tab.state）
export function syncCurrentState(state: EditorState): void {
  const t = currentTab();
  if (t) t.state = state;
}

// 打开文件到标签：同路径已在 → 激活既有标签；首个空白标签被复用；否则新建
export function openInTab(view: EditorView, doc: string, meta: { name: string; path: string }): Tab {
  const existing = tabs.find((t) => t.path === meta.path);
  if (existing) {
    activate(view, existing.id);
    return existing;
  }
  const blank = tabs.find((t) => !t.path && t.name === '未命名.md' && !t.dirty && t.state.doc.length === 0);
  if (blank) {
    blank.name = meta.name;
    blank.path = meta.path;
    blank.state = createEditorState(doc);
    activate(view, blank.id);
    return blank;
  }
  return pushTab(view, doc, meta);
}

function pushTab(view: EditorView, doc: string, meta: { name: string; path: string | null }): Tab {
  const t: Tab = { id: seq++, name: meta.name, path: meta.path, dirty: false, state: createEditorState(doc) };
  tabs.push(t);
  activate(view, t.id);
  return t;
}

export function newTab(view: EditorView): Tab {
  return pushTab(view, '', { name: '未命名.md', path: null });
}

// 关闭标签：脏标记时确认（FR-7.8）；至少保留一个标签
export function closeTab(view: EditorView, id: number): boolean {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const t = tabs[idx];
  if (t.dirty && !confirm(`「${t.name}」有未保存的修改，确定关闭吗？`)) return false;
  const wasCurrent = currentId === id;
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    newTab(view);
    return true;
  }
  if (wasCurrent) {
    activate(view, tabs[Math.min(idx, tabs.length - 1)].id);
  }
  return true;
}

// 切换标签
export function switchTab(view: EditorView, id: number): void {
  activate(view, id);
}

// 另存为后更新当前标签的路径与名称
export function renameCurrent(path: string, name: string): void {
  const t = currentTab();
  if (!t) return;
  t.path = path;
  t.name = name;
  syncCurrentToStore();
}
