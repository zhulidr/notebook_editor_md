import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { activeFs, isFsAccessSupported, isTauri } from '../platform';
import { insertTable } from '../editor/cm/state';
import { FONT_FAMILIES, setFontById, adjustFontSize, CODE_BG_OPTIONS, setCodeBgById } from '../editor/cm/settings';
import { cycleTheme } from '../editor/cm/theme';
import { getHtmlTheme, getCodeTheme, setHtmlTheme, setCodeTheme, triggerRehighlight, type CodeTheme } from '../highlight/shiki';
import { exportHtml } from '../render/pipeline';
import { renderCanvas, closeCanvas, isCanvasFile, isCanvasJson } from './canvas';
import { closeCommandPalette, initCommandPalette, isCommandPaletteOpen, openCommandPalette, openFileSwitcher, type PaletteCommand } from './command-palette';
import { createIcon } from './icons';
import { editorHostFor, focusNextPane, hasSplit, refreshPaneHeaders, splitDown, splitRight, toggleSplitDirection, closeSplit } from './panes';
import { refreshOutline, setOutlineView, toggleOutline } from './outline';
import { store, addRecent } from './state';
import { currentTab, tabList, newTab, openInTab, closeTab, switchTab, setTabDirty, renameTab, onTabsChanged } from './tabs';
import { pauseAutosave, scheduleAutosave } from './autosave';
import { chooseWorkspace, onWorkspaceChange, restoreWorkspace, workspaceState, type WorkspaceFile } from './workspace';
import { toast } from './toast';

let view: EditorView;

export function bindView(nextView: EditorView): void {
  view = nextView;
}

export function activateAppView(nextView: EditorView): void {
  bindView(nextView);
  setOutlineView(nextView);
  refreshAppUI();
  refreshCanvasOverlay();
}

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function refreshTitle(): void {
  const state = store.get();
  $('title').textContent = state.name;
  $('title').parentElement?.classList.toggle('dirty', state.dirty);
  const saved = $('st-saved');
  saved.textContent = state.dirty ? '未保存' : '已保存';
  saved.classList.toggle('dirty', state.dirty);
  const path = $('st-path');
  path.textContent = state.path || (state.name !== '未命名.md' ? state.name : '—');
  path.title = state.path || '';
  document.title = `${state.dirty ? '● ' : ''}${state.name} — Notebook MD`;
}

function renderTabs(): void {
  const bar = $('tabbar');
  const active = currentTab();
  bar.innerHTML = '';
  for (const tab of tabList()) {
    const item = document.createElement('div');
    item.className = `tab${tab.id === active?.id ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', tab.id === active?.id ? 'true' : 'false');
    item.title = tab.path || tab.name;

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tab.name;
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.appendChild(createIcon('x'));

    item.append(name, close);
    item.onclick = () => {
      switchTab(view, tab.id);
      refreshAppUI();
      refreshCanvasOverlay();
      view.focus();
    };
    close.onclick = (event) => {
      event.stopPropagation();
      if (closeTab(view, tab.id)) {
        refreshAppUI();
        refreshCanvasOverlay();
      }
    };
    bar.appendChild(item);
  }
}

function refreshWorkspaceStatus(): void {
  const workspace = workspaceState();
  const status = $('st-workspace');
  status.textContent = workspace.rootName ? `工作区 · ${workspace.rootName}` : '';
  status.title = workspace.rootPath ?? '';
}

function refreshCanvasOverlay(): void {
  if (!view) return;
  const tab = currentTab();
  closeCanvas();
  if (!tab) return;
  if (isCanvasFile(tab.name) && isCanvasJson(view.state.doc.toString())) {
    renderCanvas(view.state.doc.toString(), editorHostFor(view), view);
  }
}

export function refreshAppUI(): void {
  if (!view) return;
  renderTabs();
  refreshTitle();
  updateStatusbar();
  refreshOutline();
  refreshPaneHeaders();
  refreshWorkspaceStatus();
}

function needWebFsAlert(): boolean {
  return !isTauri() && !isFsAccessSupported();
}

async function openPath(path: string): Promise<void> {
  const fs = activeFs();
  let content: string;
  try {
    content = await fs.readFile(path);
  } catch (error) {
    toast('打开失败：' + (error as Error).message);
    return;
  }
  const name = fs.getName(path);
  openInTab(view, content, { path, name });
  addRecent(path, name);
  refreshAppUI();
  refreshCanvasOverlay();
  view.focus();
}

async function actNew(): Promise<void> {
  closeCanvas();
  newTab(view);
  refreshAppUI();
  view.focus();
}

async function actOpen(): Promise<void> {
  if (needWebFsAlert()) {
    alert('当前浏览器不支持 File System Access API，请使用当前版本的 Chrome 或 Edge。');
    return;
  }
  const path = await activeFs().pickFile();
  if (path) await openPath(path);
}

async function actOpenWorkspace(): Promise<void> {
  if (needWebFsAlert()) {
    alert('当前浏览器不支持文件夹访问，请使用当前版本的 Chrome 或 Edge。');
    return;
  }
  try {
    const workspace = await chooseWorkspace();
    if (!workspace) return;
    refreshWorkspaceStatus();
    toast(`已打开工作区：${workspace.rootName} · ${workspace.files.length} 个文档`);
    openFileSwitcher();
  } catch (error) {
    toast('打开工作区失败：' + (error as Error).message);
  }
}

async function actSave(): Promise<void> {
  const tab = currentTab();
  if (!tab) return;
  if (!tab.path) {
    await actSaveAs();
    return;
  }
  await pauseAutosave(tab.id);
  const doc = tab.state.doc.toString();
  try {
    await activeFs().writeFile(tab.path, doc);
  } catch (error) {
    toast('保存失败：' + (error as Error).message);
    return;
  }
  if (tab.state.doc.toString() === doc) setTabDirty(tab, false);
  refreshAppUI();
}

async function actSaveAs(): Promise<void> {
  if (needWebFsAlert()) {
    alert('当前浏览器不支持直接写盘，请使用当前版本的 Chrome 或 Edge。');
    return;
  }
  const tab = currentTab();
  if (!tab) return;
  await pauseAutosave(tab.id);
  const path = await activeFs().pickSavePath(tab.name);
  if (!path) {
    if (tab.path && tab.dirty) scheduleAutosave(view);
    return;
  }
  const doc = tab.state.doc.toString();
  try {
    await activeFs().writeFile(path, doc);
  } catch (error) {
    toast('保存失败：' + (error as Error).message);
    return;
  }
  const name = activeFs().getName(path);
  renameTab(tab.id, path, name);
  if (tab.state.doc.toString() === doc) setTabDirty(tab, false);
  addRecent(path, name);
  refreshAppUI();
}

async function actExport(): Promise<void> {
  if (needWebFsAlert()) {
    alert('当前浏览器不支持直接写盘，将无法保存导出文件。');
    return;
  }
  const path = await activeFs().pickSavePath('export.html');
  if (!path) return;
  try {
    const html = await exportHtml(view.state.doc.toString());
    await activeFs().writeFile(path, html);
    toast('已导出：' + activeFs().getName(path));
  } catch (error) {
    toast('导出失败：' + (error as Error).message);
  }
}

function actExportPdf(): void {
  toast('即将打开打印对话框，请选择“Microsoft Print to PDF”保存为 PDF');
  void exportHtml(view.state.doc.toString()).then((html) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (error) {
        console.warn('打印失败：', error);
      }
      setTimeout(() => iframe.remove(), 2000);
    };
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

function replaceSelection(text: string, cursorOffset = text.length): void {
  const transaction = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: text },
    range: EditorSelection.cursor(range.from + cursorOffset),
  }));
  view.dispatch(transaction);
  view.focus();
}

function insertCodeBlock(): void {
  replaceSelection('```\n\n```', 4);
}

function insertLink(): void {
  replaceSelection('[链接文本](url)', 1);
}

function insertMathBlock(): void {
  replaceSelection('$$\n\n$$', 3);
}

function insertDivider(): void {
  replaceSelection('\n---\n', 5);
}

function showSettings(): void {
  $('settings-pop').classList.remove('hidden');
}

function toggleSettings(event?: Event): void {
  $('settings-pop').classList.toggle('hidden');
  event?.stopPropagation();
}

function closeCurrentTab(): void {
  const tab = currentTab();
  if (!tab || !closeTab(view, tab.id)) return;
  refreshAppUI();
  refreshCanvasOverlay();
}

function commands(): PaletteCommand[] {
  return [
    { id: 'quick-open', label: '快速打开文件', group: '文件', icon: 'search', shortcut: 'Ctrl+O', keywords: ['切换文件', '搜索文件', 'quick open'], featured: true, keepOpen: true, run: openFileSwitcher },
    { id: 'new-file', label: '新建文件', group: '文件', icon: 'file-plus', shortcut: 'Ctrl+N', keywords: ['新建笔记'], featured: true, run: actNew },
    { id: 'open-file', label: '打开文件…', group: '文件', icon: 'folder-open', keywords: ['本地文件'], run: actOpen },
    { id: 'open-workspace', label: '打开文件夹…', group: '文件', icon: 'folder-open', keywords: ['工作区', '仓库'], featured: true, run: actOpenWorkspace },
    { id: 'save', label: '保存当前文件', group: '文件', icon: 'save', shortcut: 'Ctrl+S', featured: true, run: actSave },
    { id: 'save-as', label: '另存为…', group: '文件', icon: 'save-as', shortcut: 'Ctrl+Shift+S', run: actSaveAs },
    { id: 'close-tab', label: '关闭当前标签页', group: '文件', icon: 'x', shortcut: 'Ctrl+W', run: closeCurrentTab },
    { id: 'export-html', label: '导出 HTML', group: '文件', icon: 'export', run: actExport },
    { id: 'export-pdf', label: '导出 PDF', group: '文件', icon: 'print', run: actExportPdf },
    { id: 'insert-table', label: '插入表格', group: '插入', icon: 'table', keywords: ['Markdown 表格'], featured: true, run: () => { insertTable(view); } },
    { id: 'insert-code', label: '插入代码块', group: '插入', icon: 'code', keywords: ['围栏代码'], run: insertCodeBlock },
    { id: 'insert-link', label: '插入链接', group: '插入', icon: 'link', shortcut: 'Ctrl+K', run: insertLink },
    { id: 'insert-math', label: '插入数学块', group: '插入', icon: 'code', keywords: ['KaTeX', '公式'], run: insertMathBlock },
    { id: 'insert-divider', label: '插入分隔线', group: '插入', icon: 'code', keywords: ['水平线'], run: insertDivider },
    { id: 'outline', label: '显示/隐藏大纲', group: '视图与布局', icon: 'outline', keywords: ['目录', '标题'], featured: true, run: toggleOutline },
    { id: 'split-right', label: '向右分屏', group: '视图与布局', icon: 'split-right', shortcut: 'Ctrl+\\', featured: true, run: splitRight },
    { id: 'split-down', label: '向下分屏', group: '视图与布局', icon: 'split-down', shortcut: 'Ctrl+Shift+\\', featured: true, run: splitDown },
    { id: 'toggle-split', label: '切换分屏方向', group: '视图与布局', icon: 'split-right', available: hasSplit, run: toggleSplitDirection },
    { id: 'focus-next-pane', label: '聚焦下一个分屏', group: '视图与布局', icon: 'chevron', available: hasSplit, run: focusNextPane },
    { id: 'close-split', label: '关闭分屏', group: '视图与布局', icon: 'x', available: hasSplit, run: closeSplit },
    { id: 'theme', label: '切换浅色/深色模式', group: '外观与设置', icon: 'theme', featured: true, run: cycleTheme },
    { id: 'settings', label: '打开设置', group: '外观与设置', icon: 'settings', featured: true, run: showSettings },
  ];
}

function wireSettings(): void {
  const font = $('set-font') as HTMLSelectElement;
  for (const family of FONT_FAMILIES) {
    const option = document.createElement('option');
    option.value = family.id;
    option.textContent = family.label;
    font.appendChild(option);
  }
  font.value = localStorage.getItem('md-editor:fontFamily') || 'default';
  font.onchange = () => setFontById(font.value);
  $('set-size-inc').onclick = () => adjustFontSize(1);
  $('set-size-dec').onclick = () => adjustFontSize(-1);

  const htmlTheme = $('set-html-theme') as HTMLSelectElement;
  htmlTheme.value = getHtmlTheme();
  htmlTheme.onchange = () => setHtmlTheme(htmlTheme.value as CodeTheme);
  const codeTheme = $('set-code-theme') as HTMLSelectElement;
  codeTheme.value = getCodeTheme();
  codeTheme.onchange = () => setCodeTheme(codeTheme.value as CodeTheme);

  const codeBackground = $('set-code-bg') as HTMLSelectElement;
  for (const item of CODE_BG_OPTIONS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    codeBackground.appendChild(option);
  }
  codeBackground.value = localStorage.getItem('md-editor:codeBg') || 'dark';
  codeBackground.onchange = () => {
    setCodeBgById(codeBackground.value);
    triggerRehighlight();
  };

  $('btn-settings').onclick = toggleSettings;
  document.addEventListener('click', (event) => {
    const popover = $('settings-pop');
    if (!popover.classList.contains('hidden') && !popover.contains(event.target as Node) && event.target !== $('btn-settings')) {
      popover.classList.add('hidden');
    }
  });
}

function wireGlobalShortcuts(): void {
  document.addEventListener('keydown', (event) => {
    if (isCommandPaletteOpen()) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLocaleLowerCase();
    if (key === 's') {
      event.preventDefault();
      void (event.shiftKey ? actSaveAs() : actSave());
    } else if (key === 'n') {
      event.preventDefault();
      void actNew();
    } else if (key === 'o') {
      event.preventDefault();
      if (workspaceState().files.length) openFileSwitcher();
      else void actOpen();
    } else if (key === 'w') {
      event.preventDefault();
      closeCurrentTab();
    } else if (event.key === '\\') {
      event.preventDefault();
      if (event.shiftKey) splitDown();
      else splitRight();
    }
  }, true);
}

async function restoreLastFile(): Promise<void> {
  // 桌面端文件权限只在用户通过原生选择器明确授权的会话内有效。不要用
  // localStorage 中的旧路径绕过这个边界；用户可从“打开”重新选择最近文件。
  if (!isTauri()) return;
}

async function restoreLastWorkspace(): Promise<void> {
  const restored = await restoreWorkspace();
  if (restored) refreshWorkspaceStatus();
}

export function wireUI(): void {
  $('btn-new').onclick = () => void actNew();
  $('btn-open').onclick = () => void actOpen();
  $('btn-save').onclick = () => void actSave();
  $('btn-saveas').onclick = () => void actSaveAs();
  $('btn-export').onclick = () => void actExport();
  $('btn-pdf').onclick = actExportPdf;
  $('btn-outline').onclick = toggleOutline;
  $('btn-theme').onclick = cycleTheme;
  $('btn-command').onclick = () => openCommandPalette();
  $('btn-split-right').onclick = splitRight;
  $('btn-split-down').onclick = splitDown;
  wireSettings();
  wireGlobalShortcuts();

  initCommandPalette({
    commands: commands(),
    getFiles: () => workspaceState().files,
    openFile: (file: WorkspaceFile) => openPath(file.path),
    getWorkspaceName: () => workspaceState().rootName,
  });

  store.on(refreshTitle);
  onTabsChanged(refreshAppUI);
  onWorkspaceChange(refreshWorkspaceStatus);
  refreshAppUI();

  void restoreLastWorkspace();
  void restoreLastFile();
}

export function updateStatusbar(): void {
  if (!view) return;
  const doc = view.state.doc.toString();
  const words = doc.replace(/\s/g, '').length;
  const position = view.state.selection.main.head;
  const line = view.state.doc.lineAt(position);
  $('st-count').textContent = `${words} 字`;
  $('st-pos').textContent = `行 ${line.number} 列 ${position - line.from + 1}`;
}

export function closeTransientUI(): void {
  closeCommandPalette();
  $('settings-pop').classList.add('hidden');
}
