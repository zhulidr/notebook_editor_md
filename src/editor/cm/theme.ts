// 编辑器主题（明/暗）+ 应用主题管理（需求 FR-10.3：跟随系统）
import { EditorView } from '@codemirror/view';
import { Compartment } from '@codemirror/state';
import { triggerRehighlight } from '../../highlight/shiki';

export type ThemeMode = 'light' | 'dark' | 'auto';

const lightTheme = EditorView.theme({
  '&': { color: '#1f2328', backgroundColor: '#ffffff' },
  '.cm-content': { caretColor: '#185fa5' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#185fa5' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: '#e6f1fb' },
  '.cm-gutters': { backgroundColor: '#fafafa', color: '#9ca3af', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#f0f4f8' },
  '.cm-activeLine': { backgroundColor: '#f6f8fa' },
}, { dark: false });

const darkTheme = EditorView.theme({
  '&': { color: '#d4d4d4', backgroundColor: '#1e1e1e' },
  '.cm-content': { caretColor: '#4aa6ff' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#4aa6ff' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: '#264f78' },
  '.cm-gutters': { backgroundColor: '#252526', color: '#6b7280', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#2d2d2d' },
  '.cm-activeLine': { backgroundColor: '#2a2d2e' },
}, { dark: true });

const themeComp = new Compartment();
let mode: ThemeMode = (localStorage.getItem('md-editor:theme') as ThemeMode) || 'auto';
let view: EditorView | null = null;

function isDark(): boolean {
  return mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

// 编辑器扩展：放入 EditorState extensions
export function themeExtension() {
  return themeComp.of(isDark() ? darkTheme : lightTheme);
}

export function initTheme(v: EditorView): void {
  view = v;
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (mode === 'auto') apply();
  });
}

function apply(): void {
  const dark = isDark();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (view) view.dispatch({ effects: themeComp.reconfigure(dark ? darkTheme : lightTheme) });
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = mode === 'auto' ? '主题·自动' : mode === 'dark' ? '主题·暗' : '主题·亮';
  // 编辑器亮/暗切换后重新着色代码块（无背景模式下实际背景随编辑器主题变化）
  triggerRehighlight();
}

// 三态循环：亮 → 暗 → 自动
export function cycleTheme(): void {
  mode = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light';
  localStorage.setItem('md-editor:theme', mode);
  apply();
}
