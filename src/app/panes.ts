import type { EditorView } from '@codemirror/view';
import { createEditor } from '../editor/cm';
import { registerThemeView, unregisterThemeView } from '../editor/cm/theme';
import { closeCanvas } from './canvas';
import {
  activatePaneView,
  currentTab,
  registerPaneView,
  suggestedSplitTab,
  tabForView,
  unregisterPaneView,
} from './tabs';

export type SplitOrientation = 'right' | 'down';

type ActivateHandler = (view: EditorView) => void;

const ORIENTATION_KEY = 'md-editor:splitOrientation';
let primaryView: EditorView | null = null;
let secondaryView: EditorView | null = null;
let activeView: EditorView | null = null;
let onActivate: ActivateHandler = () => {};

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function stage(): HTMLElement {
  return $('editor-stage');
}

function paneFor(view: EditorView): HTMLElement {
  return view === secondaryView ? $('pane-secondary') : $('pane-primary');
}

function setActive(view: EditorView, focus = false): void {
  if (view !== primaryView && view !== secondaryView) return;
  activeView = view;
  activatePaneView(view);
  $('pane-primary').classList.toggle('active', view === primaryView);
  $('pane-secondary').classList.toggle('active', view === secondaryView);
  onActivate(view);
  refreshPaneHeaders();
  if (focus) view.focus();
}

function wirePane(view: EditorView): void {
  const pane = paneFor(view);
  pane.addEventListener('mousedown', () => setActive(view));
  view.dom.addEventListener('focusin', () => setActive(view));
}

function currentOrientation(): SplitOrientation {
  return stage().dataset.orientation === 'down' ? 'down' : 'right';
}

function setOrientation(orientation: SplitOrientation): void {
  stage().dataset.orientation = orientation;
  localStorage.setItem(ORIENTATION_KEY, orientation);
  const divider = $('split-divider');
  divider.setAttribute('aria-orientation', orientation === 'right' ? 'vertical' : 'horizontal');
}

function setSplitRatio(percent: number): void {
  const bounded = Math.max(20, Math.min(80, percent));
  stage().style.setProperty('--split-ratio', `${bounded}%`);
  $('split-divider').setAttribute('aria-valuenow', String(Math.round(bounded)));
}

function wireDivider(): void {
  const divider = $('split-divider');
  let pointerId: number | null = null;

  divider.addEventListener('pointerdown', (event) => {
    if (!hasSplit()) return;
    pointerId = event.pointerId;
    divider.setPointerCapture(pointerId);
    divider.classList.add('dragging');
    event.preventDefault();
  });
  divider.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    const rect = stage().getBoundingClientRect();
    const percent = currentOrientation() === 'right'
      ? ((event.clientX - rect.left) / rect.width) * 100
      : ((event.clientY - rect.top) / rect.height) * 100;
    setSplitRatio(percent);
  });
  const finish = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    divider.releasePointerCapture(pointerId);
    pointerId = null;
    divider.classList.remove('dragging');
  };
  divider.addEventListener('pointerup', finish);
  divider.addEventListener('pointercancel', finish);
  divider.addEventListener('keydown', (event) => {
    const orientation = currentOrientation();
    const backward = orientation === 'right' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
    const forward = orientation === 'right' ? event.key === 'ArrowRight' : event.key === 'ArrowDown';
    if (!backward && !forward) return;
    event.preventDefault();
    const current = Number(divider.getAttribute('aria-valuenow') || 50);
    setSplitRatio(current + (forward ? 5 : -5));
  });
}

export function initPanes(view: EditorView, handler: ActivateHandler): void {
  primaryView = view;
  activeView = view;
  onActivate = handler;
  wirePane(view);
  wireDivider();
  const saved = localStorage.getItem(ORIENTATION_KEY);
  setOrientation(saved === 'down' ? 'down' : 'right');
  setSplitRatio(50);
  $('btn-close-split').addEventListener('click', closeSplit);
  refreshPaneHeaders();
}

export function splitEditor(orientation: SplitOrientation): void {
  if (!primaryView) return;
  setOrientation(orientation);
  if (!secondaryView) {
    secondaryView = createEditor($('editor-secondary'), '');
    registerThemeView(secondaryView);
    const tab = suggestedSplitTab() ?? currentTab();
    if (!tab) return;
    registerPaneView(secondaryView, tab.id, false);
    wirePane(secondaryView);
  }
  stage().classList.add('is-split');
  setActive(secondaryView, true);
  refreshPaneHeaders();
}

export function splitRight(): void {
  splitEditor('right');
}

export function splitDown(): void {
  splitEditor('down');
}

export function toggleSplitDirection(): void {
  if (!hasSplit()) {
    splitRight();
    return;
  }
  setOrientation(currentOrientation() === 'right' ? 'down' : 'right');
}

export function closeSplit(): void {
  if (!secondaryView || !primaryView) return;
  // 若白板覆盖在副窗格上，先释放其全局拖动监听，再销毁窗格。
  closeCanvas();
  unregisterPaneView(secondaryView);
  unregisterThemeView(secondaryView);
  secondaryView.destroy();
  secondaryView = null;
  $('editor-secondary').innerHTML = '';
  stage().classList.remove('is-split');
  setSplitRatio(50);
  setActive(primaryView, true);
}

export function focusNextPane(): void {
  if (!primaryView) return;
  if (!secondaryView) {
    primaryView.focus();
    return;
  }
  setActive(activeView === primaryView ? secondaryView : primaryView, true);
}

export function hasSplit(): boolean {
  return secondaryView !== null && stage().classList.contains('is-split');
}

export function getActivePaneView(): EditorView | null {
  return activeView;
}

export function editorHostFor(view: EditorView): HTMLElement {
  return view === secondaryView ? $('editor-secondary') : $('editor');
}

export function refreshPaneHeaders(): void {
  const entries: Array<[EditorView | null, HTMLElement]> = [
    [primaryView, $('pane-primary')],
    [secondaryView, $('pane-secondary')],
  ];
  for (const [view, pane] of entries) {
    if (!view) continue;
    const tab = tabForView(view);
    const header = pane.querySelector<HTMLElement>('.pane-header');
    const name = pane.querySelector<HTMLElement>('.pane-name');
    if (name) {
      name.textContent = tab?.name ?? '未命名.md';
      name.title = tab?.path ?? tab?.name ?? '';
    }
    header?.classList.toggle('dirty', tab?.dirty ?? false);
  }
}
