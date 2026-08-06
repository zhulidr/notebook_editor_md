import 'katex/dist/katex.min.css';
import './styles/editor.css';
import { createEditor } from './editor/cm';
import { bindView, wireUI, updateStatusbar } from './app/app';
import { initTheme } from './editor/cm/theme';
import { initSettings } from './editor/cm/settings';
import { initOutline } from './app/outline';
import { registerFirstTab } from './app/tabs';
import { getFs, setActiveFs } from './platform';
import { insertTable } from './editor/cm/state';
import { listen } from '@tauri-apps/api/event';
import type { EditorView } from '@codemirror/view';

const editorEl = document.getElementById('editor')!;
const view = createEditor(editorEl, '');
(window as unknown as { __view: unknown }).__view = view;
bindView(view);
setActiveFs(await getFs());
registerFirstTab(view, '未命名.md', null);
initTheme(view);
initSettings();
initOutline(view);
wireUI();
updateStatusbar();

// 监听 Rust 端键盘钩子 emit 的 "ctrl-p" 事件（钩子已阻止 WebView2 打印对话框）
listen('ctrl-p', () => {
  insertTable(view as EditorView);
});
