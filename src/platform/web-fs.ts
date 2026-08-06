// Web 实现：基于 File System Access API（ARCHITECTURE.md §6）
// watchDir 无能力 → 降级为 no-op（对应需求 FR-7.5 仅桌面版生效）
import type { FileSystem, FileEntry, FsEvent } from './types';

interface Entry {
  kind: 'file' | 'dir';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
}

const registry = new Map<string, Entry>();
let seq = 0;
const key = (name: string) => `${++seq}:${name}`;

async function* iterDir(d: FileSystemDirectoryHandle): AsyncGenerator<[string, FileSystemHandle]> {
  // @ts-expect-error entries() exists on modern browsers
  for await (const [name, handle] of d.entries()) yield [name, handle] as [string, FileSystemHandle];
}

export const webFs: FileSystem = {
  async readFile(path) {
    const e = registry.get(path);
    if (!e || e.kind !== 'file') throw new Error('文件句柄不存在：' + path);
    const f = await (e.handle as FileSystemFileHandle).getFile();
    return await f.text();
  },

  async writeFile(path, content) {
    const e = registry.get(path);
    if (!e || e.kind !== 'file') throw new Error('无可写句柄，请先使用「另存为」');
    const w = await (e.handle as FileSystemFileHandle).createWritable();
    await w.write(content);
    await w.close();
  },

  async readDir(path) {
    const e = registry.get(path);
    if (!e || e.kind !== 'dir') return [];
    const out: FileEntry[] = [];
    for await (const [name, handle] of iterDir(e.handle as FileSystemDirectoryHandle)) {
      out.push({ name, path: `${path}/${name}`, isDir: handle.kind === 'directory' });
    }
    return out;
  },

  async watchDir(_path, _cb): Promise<() => void> {
    // File System Access API 无目录监听能力，降级为 no-op
    return async () => {};
  },

  async pickFile() {
    const w = window as unknown as { showOpenFilePicker: (o: unknown) => Promise<FileSystemFileHandle> };
    const handle = await w.showOpenFilePicker({
      types: [{
        description: 'Markdown / Canvas',
        accept: {
          'text/markdown': ['.md', '.markdown'],
          'application/json': ['.canvas'],
        },
      }],
    });
    const id = key(handle.name);
    registry.set(id, { kind: 'file', handle });
    return id;
  },

  async pickFolder() {
    const w = window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> };
    const handle = await w.showDirectoryPicker();
    const id = key(handle.name);
    registry.set(id, { kind: 'dir', handle });
    return id;
  },

  async pickSavePath(defaultName) {
    const w = window as unknown as { showSaveFilePicker: (o: unknown) => Promise<FileSystemFileHandle> };
    const handle = await w.showSaveFilePicker({
      suggestedName: defaultName,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
    const id = key(handle.name);
    registry.set(id, { kind: 'file', handle });
    return id;
  },

  getName(path) {
    return registry.get(path)?.handle.name ?? path;
  },
};
