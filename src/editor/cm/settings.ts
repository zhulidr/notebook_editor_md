// 编辑器设置（需求 FR-10.4：字号/字体族，即时生效并持久化）
export const FONT_FAMILIES: { id: string; label: string; value: string }[] = [
  { id: 'default', label: '系统默认', value: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: 'serif', label: '衬线', value: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif' },
  { id: 'mono', label: '等宽', value: 'ui-monospace, Consolas, "Courier New", monospace' },
];

// 代码块背景选项（bg=背景色，fg=默认前景色用于无显式着色的 token）
export const CODE_BG_OPTIONS: { id: string; label: string; bg: string; fg: string }[] = [
  { id: 'dark', label: '深色', bg: '#2b2b2b', fg: '#a9b7c6' },
  { id: 'light', label: '浅灰', bg: '#f6f8fa', fg: '#1f2328' },
  { id: 'cream', label: '米色', bg: '#fdf6e3', fg: '#3a3a3a' },
  { id: 'blue', label: '天蓝', bg: '#e8f1fb', fg: '#1f2328' },
  { id: 'none', label: '无背景', bg: 'transparent', fg: 'inherit' },
];

const FAMILY_KEY = 'md-editor:fontFamily';
const SIZE_KEY = 'md-editor:fontSize';
const CODE_BG_KEY = 'md-editor:codeBg';

const MIN_SIZE = 12;
const MAX_SIZE = 30;
const STEP = 1;

let currentFamily: string = localStorage.getItem(FAMILY_KEY) || 'default';
let currentSize: number = Number(localStorage.getItem(SIZE_KEY)) || 15;
let currentCodeBg: string = localStorage.getItem(CODE_BG_KEY) || 'dark';

function apply(): void {
  const root = document.documentElement;
  const fam = FONT_FAMILIES.find((f) => f.id === currentFamily) || FONT_FAMILIES[0];
  root.style.setProperty('--editor-font-family', fam.value);
  root.style.setProperty('--editor-font-size', `${currentSize}px`);
  // 整数行高（FR：WebView2 对小数行高有亚像素错位，行号会对不齐）
  root.style.setProperty('--editor-line-height', `${Math.round(currentSize * 1.7)}px`);
  const label = document.getElementById('st-font');
  if (label) label.textContent = `${fam.label} · ${currentSize}px`;
  // 所有编辑器视图（含分屏）监听该事件后 requestMeasure，避免 gutter 继续使用旧行高。
  window.dispatchEvent(new Event('md-editor:measure'));
}

function applyCodeBg(): void {
  const opt = CODE_BG_OPTIONS.find((o) => o.id === currentCodeBg) || CODE_BG_OPTIONS[0];
  document.documentElement.style.setProperty('--code-bg', opt.bg);
  document.documentElement.style.setProperty('--code-fg', opt.fg);
}

export function initSettings(): void {
  apply();
  applyCodeBg();
}

export function setFontById(id: string): void {
  if (!FONT_FAMILIES.some((f) => f.id === id)) return;
  currentFamily = id;
  localStorage.setItem(FAMILY_KEY, id);
  apply();
}

export function adjustFontSize(delta: number): void {
  currentSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, currentSize + delta));
  localStorage.setItem(SIZE_KEY, String(currentSize));
  apply();
}

export function setCodeBgById(id: string): void {
  if (!CODE_BG_OPTIONS.some((o) => o.id === id)) return;
  currentCodeBg = id;
  localStorage.setItem(CODE_BG_KEY, id);
  applyCodeBg();
}

export function getCodeBg(): { bg: string; fg: string } {
  const opt = CODE_BG_OPTIONS.find((o) => o.id === currentCodeBg) || CODE_BG_OPTIONS[0];
  return { bg: opt.bg, fg: opt.fg };
}

export function getFontSize(): number { return currentSize; }
