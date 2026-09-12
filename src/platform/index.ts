// 平台选择层：运行在 Tauri 内用 tauriFs，否则用 webFs（浏览器）
// 注：tauri-fs 与 @tauri-apps/api 改为静态 import —— Tauri/WebView2 自定义协议下运行时动态 import() 会挂起。
import { isTauri, invoke } from '@tauri-apps/api/core';
import { webFs } from './web-fs';
import { tauriFs } from './tauri-fs';
import type { FileSystem } from './types';

let active: FileSystem = webFs;

export function activeFs(): FileSystem {
  return active;
}

export function setActiveFs(f: FileSystem): void {
  active = f;
}

export async function getFs(): Promise<FileSystem> {
  if (isTauri()) active = tauriFs;
  return active;
}

export { webFs, isTauri };
export type { FileSystem, FileEntry, FsEvent } from './types';
export { isFsAccessSupported } from './types';

// 编辑器中的链接是用户 Markdown 的一部分。仅允许浏览器/系统明确支持且不会
// 执行脚本的外部 scheme，避免 `javascript:`、`file:` 等传入桌面 shell。
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

// 打开外部链接：Tauri 走 Rust open_url，浏览器走 window.open（需求 FR-2.4）
export async function openExternal(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) return;
  if (isTauri()) {
    await invoke('open_url', { url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
