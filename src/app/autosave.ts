// 自动保存（ARCHITECTURE.md §2 autosave.ts，需求 FR-7.2：停止输入 500ms 后触发）
import type { EditorView } from '@codemirror/view';
import { activeFs } from '../platform';
import { currentTab, setCurrentDirty } from './tabs';
import { toast } from './toast';

let timer: ReturnType<typeof setTimeout> | null = null;

// 保存快照：触发时捕获 {path, doc}，避免 500ms 内切换标签把内容写到错误路径
let pendingSave: { path: string; doc: string } | null = null;

export function scheduleAutosave(view: EditorView): void {
  const tab = currentTab();
  if (!tab || !tab.path) return; // 无路径不自动保存，等用户「另存为」
  if (timer) clearTimeout(timer);
  // 立即捕获快照：即便 500ms 内切走，保存的仍是本次编辑的文档与路径
  pendingSave = { path: tab.path, doc: view.state.doc.toString() };
  timer = setTimeout(async () => {
    const save = pendingSave;
    pendingSave = null;
    timer = null;
    if (!save) return;
    try {
      await activeFs().writeFile(save.path, save.doc);
      // 仅当当前标签仍是保存时的标签时才清脏标记，否则切走后的脏标记由目标标签自己管理
      const now = currentTab();
      if (now && now.path === save.path) setCurrentDirty(false);
    } catch (e) {
      // FR-7.2 失败告警：脏标记保留，内容不丢
      console.warn('自动保存失败：', e);
      toast('自动保存失败：' + (e as Error).message);
    }
  }, 500);
}

// 切换标签 / 关闭标签时调用，取消未决的自动保存（避免快照过期）
export function cancelAutosave(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  pendingSave = null;
}
