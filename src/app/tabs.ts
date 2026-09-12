// 多标签与多编辑区共享模型：标签保存文档状态，编辑区只负责显示某个标签。
// 同一标签可出现在两个分屏中；文档变更会同步，光标与滚动位置保持各自独立。
import { EditorState, Transaction } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { createEditorState, suppressNextUpdateFor } from '../editor/cm/state';
import { store } from './state';
import { cancelAutosave } from './autosave';

export interface Tab {
  id: number;
  name: string;
  path: string | null;
  dirty: boolean;
  state: EditorState;
}

type Listener = () => void;

const tabs: Tab[] = [];
const viewTabs = new Map<EditorView, number>();
const listeners = new Set<Listener>();
let currentId: number | null = null;
let currentView: EditorView | null = null;
let seq = 1;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function onTabsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentTab(): Tab | null {
  return tabs.find((tab) => tab.id === currentId) ?? null;
}

export function activeEditorView(): EditorView | null {
  return currentView;
}

export function tabList(): readonly Tab[] {
  return tabs;
}

export function tabForView(view: EditorView): Tab | null {
  const id = viewTabs.get(view);
  return tabs.find((tab) => tab.id === id) ?? null;
}

function syncCurrentToStore(): void {
  const tab = currentTab();
  if (tab) store.set({ path: tab.path, name: tab.name, dirty: tab.dirty });
}

function setCurrentView(view: EditorView): void {
  const id = viewTabs.get(view);
  if (id === undefined) return;
  currentView = view;
  currentId = id;
  syncCurrentToStore();
  notify();
}

function assignView(view: EditorView, tab: Tab, makeCurrent: boolean): void {
  viewTabs.set(view, tab.id);
  if (view.state !== tab.state) {
    suppressNextUpdateFor(view);
    view.setState(tab.state);
  }
  if (makeCurrent) setCurrentView(view);
  else notify();
}

export function registerFirstTab(view: EditorView, name: string, path: string | null): void {
  const tab: Tab = { id: seq++, name, path, dirty: false, state: view.state };
  tabs.push(tab);
  assignView(view, tab, true);
}

export function registerPaneView(view: EditorView, tabId?: number, makeCurrent = false): void {
  const tab = tabs.find((item) => item.id === tabId) ?? currentTab() ?? tabs[0];
  if (!tab) throw new Error('没有可显示的标签');
  assignView(view, tab, makeCurrent);
}

export function unregisterPaneView(view: EditorView): void {
  viewTabs.delete(view);
  if (currentView === view) {
    currentView = viewTabs.keys().next().value ?? null;
    currentId = currentView ? viewTabs.get(currentView) ?? null : null;
    syncCurrentToStore();
  }
  notify();
}

export function activatePaneView(view: EditorView): void {
  setCurrentView(view);
}

export function showTab(view: EditorView, id: number, makeCurrent = true): void {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  assignView(view, tab, makeCurrent);
}

/** Keep the canonical tab state in sync and mirror document edits into another pane. */
export function syncViewUpdate(update: ViewUpdate): void {
  const tab = tabForView(update.view);
  if (!tab) return;
  tab.state = update.state;

  if (update.docChanged) {
    for (const [otherView, tabId] of viewTabs) {
      if (otherView === update.view || tabId !== tab.id) continue;
      suppressNextUpdateFor(otherView);
      if (otherView.state.doc.eq(update.startState.doc)) {
        otherView.dispatch({
          changes: update.changes,
          annotations: Transaction.addToHistory.of(false),
        });
      } else {
        // 防御性恢复：正常情况下两个视图文档应始终一致。
        otherView.setState(createEditorState(update.state.doc.toString()));
      }
    }
    notify();
  }
}

export function setTabDirty(tab: Tab, dirty: boolean): void {
  if (tab.dirty === dirty) return;
  tab.dirty = dirty;
  if (tab.id === currentId) store.set({ dirty });
  notify();
}

export function setViewDirty(view: EditorView, dirty: boolean): void {
  const tab = tabForView(view);
  if (tab) setTabDirty(tab, dirty);
}

export function setCurrentDirty(dirty: boolean): void {
  const tab = currentTab();
  if (tab) setTabDirty(tab, dirty);
}

export function openInTab(view: EditorView, doc: string, meta: { name: string; path: string }): Tab {
  const existing = tabs.find((tab) => tab.path === meta.path);
  if (existing) {
    showTab(view, existing.id, true);
    return existing;
  }

  const blank = tabs.find((tab) => !tab.path && tab.name === '未命名.md' && !tab.dirty && tab.state.doc.length === 0);
  if (blank) {
    blank.name = meta.name;
    blank.path = meta.path;
    blank.state = createEditorState(doc);
    showTab(view, blank.id, true);
    return blank;
  }

  return pushTab(view, doc, meta);
}

function pushTab(view: EditorView, doc: string, meta: { name: string; path: string | null }): Tab {
  const tab: Tab = { id: seq++, name: meta.name, path: meta.path, dirty: false, state: createEditorState(doc) };
  tabs.push(tab);
  assignView(view, tab, true);
  return tab;
}

export function newTab(view: EditorView): Tab {
  return pushTab(view, '', { name: '未命名.md', path: null });
}

export function suggestedSplitTab(): Tab | null {
  const current = currentTab();
  if (!current) return tabs[0] ?? null;
  const index = tabs.findIndex((tab) => tab.id === current.id);
  return tabs[index + 1] ?? tabs[index - 1] ?? current;
}

export function closeTab(view: EditorView, id: number): boolean {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return false;
  const tab = tabs[index];
  if (tab.dirty && !confirm(`「${tab.name}」有未保存的修改，确定关闭吗？`)) return false;

  cancelAutosave(tab.id);
  tabs.splice(index, 1);
  let replacement = tabs[Math.min(index, tabs.length - 1)] ?? null;
  if (!replacement) {
    replacement = { id: seq++, name: '未命名.md', path: null, dirty: false, state: createEditorState('') };
    tabs.push(replacement);
  }

  for (const [paneView, tabId] of viewTabs) {
    if (tabId === id) assignView(paneView, replacement, paneView === currentView);
  }
  if (currentId === id) assignView(view, replacement, true);
  syncCurrentToStore();
  notify();
  return true;
}

export function switchTab(view: EditorView, id: number): void {
  showTab(view, id, true);
}

export function renameTab(id: number, path: string, name: string): void {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  tab.path = path;
  tab.name = name;
  if (tab.id === currentId) syncCurrentToStore();
  notify();
}

export function renameCurrent(path: string, name: string): void {
  const tab = currentTab();
  if (tab) renameTab(tab.id, path, name);
}
