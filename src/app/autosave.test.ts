import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';

const mocks = vi.hoisted(() => ({
  tab: null as any,
  writeFile: vi.fn(),
  setTabDirty: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../platform', () => ({
  activeFs: () => ({ writeFile: mocks.writeFile }),
}));
vi.mock('./tabs', () => ({
  tabForView: () => mocks.tab,
  tabList: () => mocks.tab ? [mocks.tab] : [],
  setTabDirty: mocks.setTabDirty,
}));
vi.mock('./toast', () => ({ toast: mocks.toast }));

import { cancelAutosave, pauseAutosave, scheduleAutosave } from './autosave';

describe('autosave', () => {
  let text = '';
  let view: EditorView;

  beforeEach(() => {
    vi.useFakeTimers();
    text = 'first';
    const doc = { toString: () => text };
    mocks.tab = { id: 7, path: '/notes/test.md', dirty: true, state: { doc } };
    view = { state: { doc } } as unknown as EditorView;
    mocks.writeFile.mockReset();
    mocks.setTabDirty.mockReset();
    mocks.toast.mockReset();
  });

  afterEach(() => {
    cancelAutosave();
    vi.useRealTimers();
  });

  it('等待正在写入的旧快照后，再写入最新快照', async () => {
    const resolves: Array<() => void> = [];
    mocks.writeFile.mockImplementation(() => new Promise<void>((resolve) => resolves.push(resolve)));

    scheduleAutosave(view);
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).toHaveBeenLastCalledWith('/notes/test.md', 'first');

    text = 'second';
    scheduleAutosave(view);
    await vi.advanceTimersByTimeAsync(500);
    // 第二笔不会越过仍在进行的第一笔，避免旧写入最后覆盖新内容。
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);

    resolves.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.writeFile).toHaveBeenCalledTimes(2);
    expect(mocks.writeFile).toHaveBeenLastCalledWith('/notes/test.md', 'second');
    resolves.shift()?.();
  });

  it('手动保存前暂停会取消尚未开始的自动保存', async () => {
    scheduleAutosave(view);
    await pauseAutosave(7);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
