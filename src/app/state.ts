// 文档状态（ARCHITECTURE.md §2 app/state.ts）
export interface DocState {
  path: string | null;
  name: string;
  dirty: boolean;
}

type Listener = (s: DocState) => void;

class Store {
  private s: DocState = { path: null, name: '未命名.md', dirty: false };
  private ls = new Set<Listener>();

  get(): DocState { return this.s; }

  set(patch: Partial<DocState>): void {
    this.s = { ...this.s, ...patch };
    for (const l of this.ls) l(this.s);
  }

  on(l: Listener): () => void {
    this.ls.add(l);
    return () => this.ls.delete(l);
  }
}

export const store = new Store();

// 最近文件（localStorage）
const RECENT_KEY = 'md-editor:recent';

export interface RecentItem { path: string; name: string; }

export function loadRecent(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

export function addRecent(path: string, name: string): void {
  const list = loadRecent().filter(r => r.path !== path);
  list.unshift({ path, name });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}
