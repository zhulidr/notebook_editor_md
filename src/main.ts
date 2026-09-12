import 'katex/dist/katex.min.css';
import './styles/editor.css';
import { createEditor } from './editor/cm';
import { activateAppView, bindView, wireUI, updateStatusbar } from './app/app';
import { initTheme } from './editor/cm/theme';
import { initSettings } from './editor/cm/settings';
import { initOutline } from './app/outline';
import { registerFirstTab } from './app/tabs';
import { getFs, isTauri, setActiveFs } from './platform';
import { listen } from '@tauri-apps/api/event';
import { initPanes } from './app/panes';
import { openCommandPalette } from './app/command-palette';

const editorEl = document.getElementById('editor')!;
const view = createEditor(editorEl, '');
(window as unknown as { __view: unknown }).__view = view;
bindView(view);
setActiveFs(await getFs());
registerFirstTab(view, '未命名.md', null);
initTheme(view);
initSettings();
initOutline(view);
initPanes(view, activateAppView);
wireUI();
updateStatusbar();

// Windows 桌面端由 Rust 钩子拦截 WebView2 的打印快捷键，再交给统一命令面板。
if (isTauri()) {
  void listen('ctrl-p', () => openCommandPalette());
}
