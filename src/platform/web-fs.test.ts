import { afterEach, describe, expect, it, vi } from 'vitest';
import { webFs } from './web-fs';

function abortError(): Error {
  const error = new Error('picker cancelled');
  error.name = 'AbortError';
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web file picker cancellation', () => {
  it('treats cancelling the open-file picker as no selection', async () => {
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(abortError()));
    await expect(webFs.pickFile()).resolves.toBeNull();
  });

  it('treats cancelling the folder picker as no selection', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(abortError()));
    await expect(webFs.pickFolder()).resolves.toBeNull();
  });

  it('treats cancelling the save picker as no selection', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(abortError()));
    await expect(webFs.pickSavePath('note.md')).resolves.toBeNull();
  });
});
