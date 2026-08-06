// Tauri 实现：通过 invoke 调用 Rust 命令（ARCHITECTURE.md §6）
// 文件对话框/打开链接由 Rust 侧 rfd/open 处理，前端无需 JS 插件包
import { invoke } from '@tauri-apps/api/core';
import type { FileSystem, FileEntry } from './types';

export const tauriFs: FileSystem = {
  readFile: (path) => invoke<string>('read_file', { path }),
  writeFile: (path, content) => invoke<void>('write_file', { path, content }),
  readDir: (path) => invoke<FileEntry[]>('read_dir', { path }),
  // M3 暂不实现目录监听（M4 用 notify crate 补 watch_dir 命令）
  watchDir: async () => async () => {},
  pickFile: () => invoke<string | null>('pick_open_file'),
  pickFolder: () => invoke<string | null>('pick_folder'),
  pickSavePath: (defaultName) => invoke<string | null>('pick_save_file', { default_name: defaultName }),
  getName: (path) => path.split(/[\\/]/).pop() || path,
};
