// 自动保存：每个标签独立去抖，并且同一标签的写入严格串行。
// 这样较旧的异步写入绝不会在较新的快照之后落盘。
import type { EditorView } from '@codemirror/view';
import { activeFs } from '../platform';
import { setTabDirty, tabForView, tabList, type Tab } from './tabs';
import { toast } from './toast';

interface AutosaveState {
  timer?: ReturnType<typeof setTimeout>;
  generation: number;
  inFlight: Promise<void>;
}

const states = new Map<number, AutosaveState>();

function stateFor(tab: Tab): AutosaveState {
  let state = states.get(tab.id);
  if (!state) {
    state = { generation: 0, inFlight: Promise.resolve() };
    states.set(tab.id, state);
  }
  return state;
}

export function scheduleAutosave(view: EditorView): void {
  const tab = tabForView(view);
  if (!tab?.path) return;

  const state = stateFor(tab);
  if (state.timer) clearTimeout(state.timer);
  const path = tab.path;
  const doc = view.state.doc.toString();
  const generation = ++state.generation;
  state.timer = setTimeout(() => {
    state.timer = undefined;
    // 先等前一笔完成。若在等待期间已有更新的快照，旧快照无需写盘。
    state.inFlight = state.inFlight.catch(() => undefined).then(async () => {
      if (state.generation !== generation) return;
      try {
        await activeFs().writeFile(path, doc);
        // 保存完成后若又有新编辑或另存为，保留脏标记，等待最新快照完成。
        if (
          state.generation === generation
          && tabList().includes(tab)
          && tab.path === path
          && tab.state.doc.toString() === doc
        ) {
          setTabDirty(tab, false);
        }
      } catch (error) {
        console.warn('自动保存失败：', error);
        toast('自动保存失败：' + (error as Error).message);
      }
    });
  }, 500);
}

// 手动保存/另存为前先停止待执行任务，并等待已经开始的写入，避免旧路径或旧文本
// 与用户刚触发的保存并发落盘。
export async function pauseAutosave(tabId: number): Promise<void> {
  const state = states.get(tabId);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  state.generation++;
  await state.inFlight.catch(() => undefined);
}

export function cancelAutosave(tabId?: number): void {
  if (tabId !== undefined) {
    const state = states.get(tabId);
    if (state?.timer) clearTimeout(state.timer);
    if (state) state.generation++;
    states.delete(tabId);
    return;
  }
  states.forEach((state) => {
    if (state.timer) clearTimeout(state.timer);
    state.generation++;
  });
  states.clear();
}
