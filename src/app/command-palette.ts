import { createIcon, type IconName } from './icons';
import type { WorkspaceFile } from './workspace';

export type CommandGroup = '文件' | '插入' | '视图与布局' | '外观与设置';

export interface PaletteCommand {
  id: string;
  label: string;
  group: CommandGroup;
  icon: IconName;
  run: () => void | Promise<void>;
  shortcut?: string;
  keywords?: readonly string[];
  featured?: boolean;
  keepOpen?: boolean;
  available?: () => boolean;
}

interface PaletteOptions {
  commands: readonly PaletteCommand[];
  getFiles: () => readonly WorkspaceFile[];
  openFile: (file: WorkspaceFile) => void | Promise<void>;
  getWorkspaceName: () => string;
}

interface PaletteItem {
  key: string;
  label: string;
  context: string;
  group: string;
  icon: IconName;
  shortcut?: string;
  score: number;
  keepOpen: boolean;
  run: () => void | Promise<void>;
}

type PaletteMode = 'all' | 'files';

let options: PaletteOptions | null = null;
let mode: PaletteMode = 'all';
let items: PaletteItem[] = [];
let activeIndex = 0;
let initialized = false;

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\\/_\-.]+/g, ' ');
}

/**
 * Small deterministic fuzzy matcher: contiguous/word-start matches rank first,
 * then ordered-character matches. Returning -1 means no match.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = normalize(query);
  const text = normalize(candidate);
  if (!q) return 1;
  if (!text) return -1;
  if (text === q) return 1200;
  if (text.startsWith(q)) return 1000 - Math.min(200, text.length - q.length);
  const wordIndex = text.split(/\s+/).findIndex((word) => word.startsWith(q));
  if (wordIndex >= 0) return 850 - wordIndex * 8;
  const direct = text.indexOf(q);
  if (direct >= 0) return 700 - direct * 3;

  let cursor = 0;
  let score = 300;
  let previous = -2;
  for (const char of q) {
    const index = text.indexOf(char, cursor);
    if (index < 0) return -1;
    score += index === previous + 1 ? 14 : 2;
    score -= Math.min(8, index - cursor);
    previous = index;
    cursor = index + 1;
  }
  return score - Math.max(0, text.length - q.length) * 0.25;
}

function commandScore(command: PaletteCommand, query: string): number {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return command.featured ? 100 : 10;
  const haystack = [command.label, command.id, ...(command.keywords ?? [])].join(' ');
  let total = 0;
  for (const token of tokens) {
    const score = fuzzyScore(token, haystack);
    if (score < 0) return -1;
    total += score;
  }
  return total;
}

function fileScore(file: WorkspaceFile, query: string): number {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 15;
  let total = 0;
  for (const token of tokens) {
    const nameScore = fuzzyScore(token, file.name);
    const pathScore = fuzzyScore(token, file.relativePath);
    const best = Math.max(nameScore < 0 ? -1 : nameScore + 160, pathScore);
    if (best < 0) return -1;
    total += best;
  }
  return total;
}

function collectItems(query: string): PaletteItem[] {
  if (!options) return [];
  const next: PaletteItem[] = [];

  if (mode === 'all') {
    for (const command of options.commands) {
      if (command.available && !command.available()) continue;
      if (!query && !command.featured) continue;
      const score = commandScore(command, query);
      if (score < 0) continue;
      next.push({
        key: `command:${command.id}`,
        label: command.label,
        context: command.keywords?.slice(0, 2).join(' · ') ?? '',
        group: command.group,
        icon: command.icon,
        shortcut: command.shortcut,
        score,
        keepOpen: command.keepOpen ?? false,
        run: command.run,
      });
    }
  }

  const files = options.getFiles();
  if (mode === 'files' || query) {
    for (const file of files) {
      const score = fileScore(file, query);
      if (score < 0) continue;
      next.push({
        key: `file:${file.path}`,
        label: file.name,
        context: file.relativePath,
        group: '工作区文件',
        icon: 'file',
        score,
        keepOpen: false,
        run: () => options!.openFile(file),
      });
    }
  }

  if (!query && mode === 'all') return next.slice(0, 24);
  return next.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'zh-CN')).slice(0, 24);
}

function appendShortcut(parent: HTMLElement, shortcut: string): void {
  const wrap = document.createElement('span');
  wrap.className = 'command-item-shortcut';
  for (const key of shortcut.split('+')) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key.trim();
    wrap.appendChild(kbd);
  }
  parent.appendChild(wrap);
}

function render(): void {
  const input = $('command-input') as HTMLInputElement;
  const list = $('command-results');
  items = collectItems(input.value);
  activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
  list.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'command-empty';
    const workspaceName = options?.getWorkspaceName();
    empty.textContent = mode === 'files' && !workspaceName
      ? '尚未打开工作区。按 Esc 返回，然后选择“打开文件夹…”。'
      : '没有匹配的命令或文件';
    list.appendChild(empty);
    return;
  }

  let lastGroup = '';
  items.forEach((item, index) => {
    if (item.group !== lastGroup) {
      const group = document.createElement('div');
      group.className = 'command-group-label';
      group.textContent = item.group;
      list.appendChild(group);
      lastGroup = item.group;
    }

    const row = document.createElement('div');
    row.id = `command-result-${index}`;
    row.className = `command-item${index === activeIndex ? ' selected' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');

    const icon = document.createElement('span');
    icon.className = 'command-item-icon';
    icon.appendChild(createIcon(item.icon));

    const copy = document.createElement('span');
    copy.className = 'command-item-copy';
    const title = document.createElement('span');
    title.className = 'command-item-title';
    title.textContent = item.label;
    copy.appendChild(title);
    if (item.context && item.context !== item.label) {
      const context = document.createElement('span');
      context.className = 'command-item-context';
      context.textContent = item.context;
      copy.appendChild(context);
    }

    row.append(icon, copy);
    if (item.shortcut) appendShortcut(row, item.shortcut);
    row.addEventListener('mousemove', () => {
      if (activeIndex === index) return;
      activeIndex = index;
      render();
    });
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => void execute(index));
    list.appendChild(row);
  });

  input.setAttribute('aria-activedescendant', `command-result-${activeIndex}`);
}

async function execute(index = activeIndex): Promise<void> {
  const item = items[index];
  if (!item) return;
  if (!item.keepOpen) closeCommandPalette();
  await item.run();
  if (item.keepOpen) render();
}

function moveSelection(delta: number): void {
  if (!items.length) return;
  activeIndex = (activeIndex + delta + items.length) % items.length;
  render();
  document.getElementById(`command-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
}

function handleKeys(event: KeyboardEvent): void {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLocaleLowerCase() === 'p') {
    event.preventDefault();
    event.stopPropagation();
    openCommandPalette('all');
    return;
  }

  if ($('command-overlay').classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (mode === 'files') {
      mode = 'all';
      const input = $('command-input') as HTMLInputElement;
      input.value = '';
      input.placeholder = '搜索命令或文件…';
      activeIndex = 0;
      render();
    } else {
      closeCommandPalette();
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void execute();
  }
}

export function initCommandPalette(nextOptions: PaletteOptions): void {
  options = nextOptions;
  if (initialized) return;
  initialized = true;
  const input = $('command-input') as HTMLInputElement;
  input.addEventListener('input', () => { activeIndex = 0; render(); });
  $('command-overlay').addEventListener('mousedown', (event) => {
    if (event.target === $('command-overlay')) closeCommandPalette();
  });
  document.addEventListener('keydown', handleKeys, true);
}

export function openCommandPalette(nextMode: PaletteMode = 'all'): void {
  if (!options) return;
  mode = nextMode;
  activeIndex = 0;
  const overlay = $('command-overlay');
  const input = $('command-input') as HTMLInputElement;
  overlay.classList.remove('hidden');
  input.value = '';
  input.placeholder = mode === 'files' ? '搜索工作区文件…' : '搜索命令或文件…';
  render();
  requestAnimationFrame(() => input.focus());
}

export function openFileSwitcher(): void {
  openCommandPalette('files');
}

export function closeCommandPalette(): void {
  $('command-overlay').classList.add('hidden');
  mode = 'all';
}

export function isCommandPaletteOpen(): boolean {
  return !$('command-overlay').classList.contains('hidden');
}
