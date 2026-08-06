// 平台适配层接口（ARCHITECTURE.md §6）
// 核心 TS 代码只依赖此接口，浏览器与桌面壳各提供实现。

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FsEvent {
  kind: 'create' | 'modify' | 'remove';
  path: string;
}

export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>; // 原子写
  readDir(path: string): Promise<FileEntry[]>;
  watchDir(path: string, cb: (e: FsEvent) => void): Promise<() => void>;
  pickFile(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  pickSavePath(defaultName: string): Promise<string | null>;
  getName(path: string): string;
}

export function isFsAccessSupported(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}
