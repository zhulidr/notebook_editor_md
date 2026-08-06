// 应用装配（ARCHITECTURE.md §2 app.ts）
import type { EditorView } from '@codemirror/view';
import { activeFs, isTauri, isFsAccessSupported } from '../platform';
import { store, addRecent, loadRecent, type RecentItem } from './state';
import { currentTab, tabList, newTab, openInTab, closeTab, switchTab, setCurrentDirty, renameCurrent } from './tabs';
import { exportHtml } from '../render/pipeline';
import { cycleTheme } from '../editor/cm/theme';
import { toggleOutline, refreshOutline } from './outline';
import { FONT_FAMILIES, setFontById, adjustFontSize, CODE_BG_OPTIONS, setCodeBgById } from '../editor/cm/settings';
import { getHtmlTheme, getCodeTheme, setHtmlTheme, setCodeTheme, triggerRehighlight, type CodeTheme } from '../highlight/shiki';
import { toast } from './toast';
import { renderCanvas, closeCanvas, isCanvasFile, isCanvasJson } from './canvas';

let view: EditorView;

export function bindView(v: EditorView): void { view = v; }

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function refreshTitle(): void {
  const s = store.get();
  const el = $('title');
  el.textContent = s.name;
  el.classList.toggle('dirty', s.dirty);
  $('st-saved').textContent = s.dirty ? '未保存' : '已保存';
  // FR-8.5 状态栏文件路径：有路径显示完整路径，新建显示占位
  const st = $('st-path');
  st.textContent = s.path || (s.name !== '未命名.md' ? s.name : '—');
  st.title = s.path || '';
}

// 渲染标签栏（FR-7.8）
function renderTabs(): void {
  const bar = $('tabbar');
  bar.innerHTML = '';
  const cur = currentTab();
  for (const t of tabList()) {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === cur?.id ? ' active' : '') + (t.dirty ? ' dirty' : '');
    el.textContent = t.name;
    el.title = t.path || t.name;
    el.onclick = () => { switchTab(view, t.id); syncUI(); refreshCanvasOverlay(); };
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.onclick = (e) => {
      e.stopPropagation();
      if (closeTab(view, t.id)) syncUI();
    };
    el.appendChild(close);
    bar.appendChild(el);
  }
}

// 切换标签后按当前文件是否为 .canvas 决定是否渲染白板
function refreshCanvasOverlay(): void {
  const t = currentTab();
  closeCanvas();
  if (!t) return;
  if (isCanvasFile(t.name) && isCanvasJson(t.state.doc.toString())) {
    renderCanvas(t.state.doc.toString(), $('editor'), view);
  }
}

// 统一刷新：标签栏 + 状态栏 + 大纲（订阅 store 或标签结构变化后调用）
function syncUI(): void {
  renderTabs();
  updateStatusbar();
  refreshOutline();
}

function needWebFsAlert(): boolean {
  // 仅浏览器版且不支持 FS Access API 时提示；Tauri 版无需
  return !isTauri() && !isFsAccessSupported();
}

async function actNew(): Promise<void> {
  closeCanvas();
  newTab(view);
  syncUI();
}

async function actOpen(): Promise<void> {
  if (needWebFsAlert()) { alert('当前浏览器不支持 File System Access API，请用 Chrome/Edge。'); return; }
  const fs = activeFs();
  const path = await fs.pickFile();
  if (!path) return;
  let content: string;
  try {
    content = await fs.readFile(path);
  } catch (e) {
    toast('打开失败：' + (e as Error).message);
    return;
  }
  const name = fs.getName(path);
  openInTab(view, content, { path, name });
  addRecent(path, name);
  syncUI();
  // Canvas 文件：加载后渲染白板
  if (isCanvasFile(name)) renderCanvas(content, $('editor'), view);
}

async function actSave(): Promise<void> {
  const fs = activeFs();
  const tab = currentTab();
  if (!tab) return;
  if (!tab.path) { await actSaveAs(); return; }
  try {
    await fs.writeFile(tab.path, view.state.doc.toString());
  } catch (e) {
    toast('保存失败：' + (e as Error).message);
    return; // 脏标记保留，内容不丢
  }
  setCurrentDirty(false);
  syncUI();
}

async function actSaveAs(): Promise<void> {
  if (needWebFsAlert()) { alert('当前浏览器不支持直接写盘，请用 Chrome/Edge。'); return; }
  const fs = activeFs();
  const tab = currentTab();
  if (!tab) return;
  const path = await fs.pickSavePath(tab.name);
  if (!path) return;
  try {
    await fs.writeFile(path, view.state.doc.toString());
  } catch (e) {
    toast('保存失败：' + (e as Error).message);
    return;
  }
  const name = fs.getName(path);
  renameCurrent(path, name);
  setCurrentDirty(false);
  addRecent(path, name);
  syncUI();
}

async function actExport(): Promise<void> {
  if (needWebFsAlert()) { alert('当前浏览器不支持直接写盘，将无法保存导出文件。'); return; }
  const fs = activeFs();
  const path = await fs.pickSavePath('export.html');
  if (!path) return;
  try {
    const html = await exportHtml(view.state.doc.toString());
    await fs.writeFile(path, html);
    toast('已导出：' + fs.getName(path));
  } catch (e) {
    toast('导出失败：' + (e as Error).message);
  }
}

// FR-9.2 导出 PDF：隐藏 iframe 加载导出 HTML 后调用系统打印（用户在打印对话框中选择
// “Microsoft Print to PDF”即可生成 PDF 文件；WebView2 无法直接生成 PDF 而不经打印对话框）
function actExportPdf(): void {
  toast('即将打开打印对话框，请选择“Microsoft Print to PDF”保存为 PDF');
  void exportHtml(view.state.doc.toString()).then((html) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) { console.warn('打印失败：', e); }
      setTimeout(() => iframe.remove(), 2000);
    };
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

function wireSettings(): void {
  const sel = $('set-font') as HTMLSelectElement;
  for (const f of FONT_FAMILIES) {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.label;
    sel.appendChild(opt);
  }
  sel.value = localStorage.getItem('md-editor:fontFamily') || 'default';
  sel.onchange = () => setFontById(sel.value);
  $('set-size-inc').onclick = () => adjustFontSize(1);
  $('set-size-dec').onclick = () => adjustFontSize(-1);

  // HTML 代码主题与代码块主题选择（Obsidian / IDEA）
  const htmlSel = $('set-html-theme') as HTMLSelectElement;
  htmlSel.value = getHtmlTheme();
  htmlSel.onchange = () => setHtmlTheme(htmlSel.value as CodeTheme);
  const codeSel = $('set-code-theme') as HTMLSelectElement;
  codeSel.value = getCodeTheme();
  codeSel.onchange = () => setCodeTheme(codeSel.value as CodeTheme);

  // 代码块背景选择（深色/浅灰/米色/天蓝/无背景）
  const bgSel = $('set-code-bg') as HTMLSelectElement;
  for (const o of CODE_BG_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = o.id; opt.textContent = o.label;
    bgSel.appendChild(opt);
  }
  bgSel.value = localStorage.getItem('md-editor:codeBg') || 'dark';
  bgSel.onchange = () => {
    setCodeBgById(bgSel.value);
    triggerRehighlight(); // 背景切换后重新着色代码块（浅色背景需加深过浅 token 颜色）
  };

  const pop = $('settings-pop');
  $('btn-settings').onclick = (e) => {
    pop.classList.toggle('hidden');
    e.stopPropagation();
  };
  document.addEventListener('click', (e) => {
    if (!pop.classList.contains('hidden') && !pop.contains(e.target as Node)) {
      pop.classList.add('hidden');
    }
  });
}

// FR-7.4 启动恢复上次文件（仅桌面版；浏览器 FS Access 无持久句柄）
async function restoreLastFile(): Promise<void> {
  if (!isTauri()) return;
  const recent: RecentItem[] = loadRecent();
  const first = recent[0];
  if (!first) return;
  try {
    const content = await activeFs().readFile(first.path);
    openInTab(view, content, { path: first.path, name: first.name });
    syncUI();
    if (isCanvasFile(first.name)) renderCanvas(content, $('editor'), view);
  } catch (e) {
    console.warn('恢复上次文件失败：', e);
  }
}

export function wireUI(): void {
  $('btn-new').onclick = () => void actNew();
  $('btn-open').onclick = () => void actOpen();
  $('btn-save').onclick = () => void actSave();
  $('btn-saveas').onclick = () => void actSaveAs();
  $('btn-export').onclick = () => void actExport();
  $('btn-pdf').onclick = () => actExportPdf();
  $('btn-outline').onclick = () => toggleOutline();
  $('btn-theme').onclick = () => cycleTheme();
  wireSettings();

  store.on(refreshTitle);
  store.on(syncUI);
  refreshTitle();
  syncUI();

  void restoreLastFile();
}

export function updateStatusbar(): void {
  const doc = view.state.doc.toString();
  const words = doc.replace(/\s/g, '').length;
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  $('st-count').textContent = `${words} 字`;
  $('st-pos').textContent = `行 ${line.number} 列 ${pos - line.from + 1}`;
}
