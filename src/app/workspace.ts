import { activeFs, isTauri } from '../platform';

export interface WorkspaceFile {
  name: string;
  path: string;
  relativePath: string;
}

export interface WorkspaceState {
  rootPath: string | null;
  rootName: string;
  files: readonly WorkspaceFile[];
  scanning: boolean;
}

type Listener = (state: WorkspaceState) => void;

const WORKSPACE_KEY = 'md-editor:workspace';
const MAX_FILES = 5000;
const MAX_DEPTH = 24;
const IGNORED_DIRECTORIES = new Set([
  '.git', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'target', '.next', '.cache',
]);

let state: WorkspaceState = { rootPath: null, rootName: '', files: [], scanning: false };
const listeners = new Set<Listener>();

function publish(patch: Partial<WorkspaceState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

export function workspaceState(): WorkspaceState {
  return state;
}

export function onWorkspaceChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function relativeWorkspacePath(rootPath: string, path: string): string {
  const root = rootPath.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const target = path.replace(/\\/g, '/');
  const rootLower = root.toLocaleLowerCase();
  const targetLower = target.toLocaleLowerCase();
  if (targetLower === rootLower) return '';
  if (targetLower.startsWith(rootLower + '/')) return target.slice(root.length + 1);
  return target.split('/').pop() || target;
}

async function scanDirectory(rootPath: string): Promise<WorkspaceFile[]> {
  const fs = activeFs();
  const files: WorkspaceFile[] = [];
  const pending: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];

  while (pending.length && files.length < MAX_FILES) {
    const current = pending.shift()!;
    let entries;
    try {
      entries = await fs.readDir(current.path);
    } catch (error) {
      console.warn('跳过无法读取的目录：', current.path, error);
      continue;
    }

    entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of entries) {
      if (entry.isDir) {
        if (current.depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase())) {
          pending.push({ path: entry.path, depth: current.depth + 1 });
        }
        continue;
      }
      if (!/\.(md|markdown|canvas)$/i.test(entry.name)) continue;
      files.push({
        name: entry.name,
        path: entry.path,
        relativePath: relativeWorkspacePath(rootPath, entry.path),
      });
      if (files.length >= MAX_FILES) break;
    }
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'));
}

async function loadWorkspace(rootPath: string, persist: boolean): Promise<WorkspaceState> {
  const fs = activeFs();
  publish({ rootPath, rootName: fs.getName(rootPath), files: [], scanning: true });
  try {
    const files = await scanDirectory(rootPath);
    if (persist && isTauri()) localStorage.setItem(WORKSPACE_KEY, rootPath);
    publish({ files, scanning: false });
  } catch (error) {
    publish({ rootPath: null, rootName: '', files: [], scanning: false });
    throw error;
  }
  return state;
}

export async function chooseWorkspace(): Promise<WorkspaceState | null> {
  const path = await activeFs().pickFolder();
  if (!path) return null;
  return loadWorkspace(path, true);
}

export async function restoreWorkspace(): Promise<WorkspaceState | null> {
  if (!isTauri()) return null;
  // 原生目录访问由文件夹选择器在当前会话授权。持久化路径只能用于展示最近
  // 记录，不能在启动时自动重新读取，否则 WebView 的恶意脚本也能借此越权。
  return null;
}
