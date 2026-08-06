// 编辑器装配（ARCHITECTURE.md §2 editor/cm/index.ts）
// 状态工厂已拆至 ./state（避免 tabs ↔ editor 循环依赖），此处只做装配与回调注册。
import type { EditorView } from '@codemirror/view';
import { createEditor as makeEditor, createEditorState, setEditHandler } from './state';
import { scheduleAutosave } from '../../app/autosave';
import { setCurrentDirty, syncCurrentState } from '../../app/tabs';
import { updateStatusbar } from '../../app/app';
import { refreshOutline } from '../../app/outline';

export { createEditorState };
export type { EditHandler } from './state';

// 注册编辑回调：状态同步/脏标记/自动保存/大纲/状态栏（由 createEditorState 内 updateListener 触发）
export function createEditor(parent: HTMLElement, doc: string): EditorView {
  setEditHandler((view, docChanged, selectionSet) => {
    syncCurrentState(view.state);
    if (docChanged) {
      setCurrentDirty(true);
      scheduleAutosave(view);
      refreshOutline();
    }
    if (docChanged || selectionSet) updateStatusbar();
  });
  return makeEditor(parent, doc);
}
