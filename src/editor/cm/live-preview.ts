// Live Preview 核心（ARCHITECTURE.md §3）
// 用 StateField 提供装饰：block 装饰（代码块/表格/块公式）只能由 StateField 给出（CM6 规则）。
import { Compartment, RangeSetBuilder, StateField, StateEffect, type EditorState } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { InlineMathWidget, BlockMathWidget } from '../widgets/math';
import { TableWidget } from '../widgets/table';
import { ImageWidget } from '../widgets/image';
import { CheckboxWidget } from '../widgets/checkbox';
import { LinkWidget } from '../widgets/link';
import { HtmlWidget } from '../widgets/html';
import { ListMarkWidget } from '../widgets/list';
import { MermaidWidget } from '../widgets/mermaid';
import { DataviewWidget } from '../widgets/dataview';
import { CodeBlockLabelWidget } from '../widgets/code-block';
import { CalloutHeaderWidget } from '../widgets/callout';
import { highlightTokens, onCodeThemeChange, type TokenLine } from '../../highlight/shiki';

interface Deco { from: number; to: number; dec: Decoration; }
interface Range { from: number; to: number; }

const INLINE_PARENTS = new Set([
  'Paragraph', 'ListItem', 'TableCell', 'SetextHeading1', 'SetextHeading2',
]);
const VOID_HTML = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// 语法树异步解析完成后再算一次（避免打开文件后首屏不渲染；行内格式节点缺失时也触发）
const recompute = StateEffect.define<void>();
const compositionStarted = StateEffect.define<void>();
const compositionEnded = StateEffect.define<void>();

// 输入法组合期间冻结当前预览装饰。原本显示源码就继续显示源码，原本已经渲染的
// HtmlWidget 也保持原 DOM，不在每个拼音/标点事务间来回切换。
const compositionActive = StateField.define<boolean>({
  create: () => false,
  update(active, tr) {
    if (tr.effects.some((effect) => effect.is(compositionStarted))) return true;
    if (tr.effects.some((effect) => effect.is(compositionEnded))) return false;
    return active;
  },
});

// 每个标签都有稳定身份，代码着色缓存按文档隔离，避免两个分屏互相污染偏移。
let documentSeq = 1;
export const documentIdentity = StateField.define<number>({
  create: () => documentSeq++,
  update: (identity) => identity,
});

interface TokenDocumentData {
  gen: number;
  currentBases: Set<number>;
  cache: Map<string, string>;
  store: Map<number, TokenLine[]>;
}

const tokenDocuments = new Map<number, TokenDocumentData>();
const editorViews = new Set<EditorView>();

// 字号由全局 CSS 变量控制。通过一个独立 Compartment 重新配置同样的度量规则，
// 让 CodeMirror 标记 geometryChanged 并重新计算 gutter 高度，而不是只重绘正文。
const fontMetricsCompartment = new Compartment();
function fontMetricsTheme() {
  return EditorView.theme({
    '.cm-scroller': {
      fontSize: 'var(--editor-font-size, 15px)',
      lineHeight: 'var(--editor-line-height, 26px)',
      fontFamily: 'var(--editor-font-family, inherit)',
    },
  });
}
export function fontMetricsExtension() {
  return fontMetricsCompartment.of(fontMetricsTheme());
}
function refreshFontMetrics(view: EditorView): void {
  view.dispatch({ effects: fontMetricsCompartment.reconfigure(fontMetricsTheme()) });
  view.requestMeasure();
}

function documentId(state: EditorState): number {
  return state.field(documentIdentity, false) ?? 0;
}

function tokenData(idOrState: number | EditorState): TokenDocumentData {
  const id = typeof idOrState === 'number' ? idOrState : documentId(idOrState);
  let data = tokenDocuments.get(id);
  if (!data) {
    data = { gen: 0, currentBases: new Set(), cache: new Map(), store: new Map() };
    tokenDocuments.set(id, data);
  }
  return data;
}

export const viewCapture = ViewPlugin.fromClass(class {
  private readonly measure = () => refreshFontMetrics(this.view);
  constructor(readonly view: EditorView) {
    editorViews.add(view);
    window.addEventListener('md-editor:measure', this.measure);
  }
  update() {}
  destroy() {
    editorViews.delete(this.view);
    window.removeEventListener('md-editor:measure', this.measure);
  }
}, {
  eventHandlers: {
    compositionstart(_event, view) {
      if (view.state.field(compositionActive, false) !== true) {
        view.dispatch({ effects: compositionStarted.of() });
      }
    },
    compositionend(_event, view) {
      // 等浏览器完成 composition 的 DOM/选区同步后解除冻结并统一重算一次。
      setTimeout(() => {
        if (editorViews.has(view) && !view.compositionStarted) {
          view.dispatch({ effects: [compositionEnded.of(), recompute.of()] });
        }
      }, 0);
    },
  },
  provide: () => compositionActive,
});

// 注册一次主题监听，清理所有文档缓存并让两个分屏分别重算。
onCodeThemeChange(() => {
  tokenDocuments.forEach((data) => {
    data.cache.clear();
    data.store.clear();
    data.gen++;
  });
  editorViews.forEach((editorView) => editorView.dispatch({ effects: recompute.of() }));
});

// treeWatcher：检测语法树对象引用变化（异步解析推进会返回新 Tree 对象）。
// 旧逻辑仅在 viewportChanged 时检查，导致光标在视口内移动时即使语法树异步解析完成也不刷新装饰，
// 表现为 ~~删除线~~、<u>下划线</u> 等依赖语法树节点的格式光标离开后不显示预览。
export const treeWatcher = ViewPlugin.fromClass(class {
  lastTree: unknown = null;
  pending = false;
  destroyed = false;

  constructor(readonly view: EditorView) {}

  update(vu: ViewUpdate) {
    const tree = syntaxTree(vu.view.state);
    if (tree === this.lastTree) return;
    this.lastTree = tree;
    // docChanged 已由 livePreview.update 处理，避免重复 build
    if (vu.docChanged || this.pending) return;

    // CodeMirror 不允许在插件的 update 周期内再次 dispatch。延迟到微任务，
    // 同时合并同一轮解析产生的重复通知，避免分屏/主题切换时插件崩溃。
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (!this.destroyed) this.view.dispatch({ effects: recompute.of() });
    });
  }

  destroy() { this.destroyed = true; }
}, {});

// ---- 代码块逐行着色（异步）----
// 携带着色 token 的 effect：{ base: 代码内容起始绝对偏移, tokens: 各 token 相对 base 的偏移+颜色, gen: 调度时的文档代际 }
const codeTokens = StateEffect.define<{ base: number; tokens: TokenLine[]; gen: number }>();

interface CodeBlockRequest { documentId: number; base: number; code: string; lang: string; gen: number; }
let pendingCode: CodeBlockRequest[] = [];
let scheduled = false;

function scheduleCodeTokens(state: EditorState, base: number, code: string, lang: string): void {
  const id = documentId(state);
  const data = tokenData(id);
  data.currentBases.add(base);
  const key = `${base}|${lang}|${code}`;
  if (data.cache.has(key)) return;
  // LRU 淘汰：满额时删最早一条，避免全清导致批量重算闪烁
  if (data.cache.size >= 200) {
    const first = data.cache.keys().next().value;
    if (first !== undefined) data.cache.delete(first);
  }
  data.cache.set(key, '');
  pendingCode.push({ documentId: id, base, code, lang, gen: data.gen });
  if (scheduled) return;
  scheduled = true;
  void (async () => {
    await Promise.resolve();
    const reqs = pendingCode;
    pendingCode = [];
    scheduled = false;
    for (const r of reqs) {
      const requestData = tokenData(r.documentId);
      if (r.gen !== requestData.gen) continue;
      const lines = await highlightTokens(r.code, r.lang);
      if (!lines || r.gen !== requestData.gen) continue;
      // 同一文档可同时显示在两个分屏中；异步 token 到达时必须给每个对应 View
      // 派发 effect，不能只更新 Set 中的第一个视图。
      const targets = Array.from(editorViews).filter((editorView) => documentId(editorView.state) === r.documentId);
      for (const target of targets) {
        target.dispatch({ effects: codeTokens.of({ base: r.base, tokens: lines, gen: r.gen }) });
      }
    }
  })();
}

function activeLines(state: EditorState): Set<number> {
  const s = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) s.add(n);
  }
  return s;
}

function overlapsLine(state: EditorState, from: number, to: number, active: Set<number>): boolean {
  const a = state.doc.lineAt(from).number;
  const b = state.doc.lineAt(to).number;
  for (let n = a; n <= b; n++) if (active.has(n)) return true;
  return false;
}

function insideAny(from: number, to: number, ranges: Range[]): boolean {
  for (const r of ranges) if (from < r.to && to > r.from) return true;
  return false;
}

// 选区是否触及 [from, to)（光标在该区间内才算“正在编辑”，用于行内/块级公式：
// 输入完公式后光标落在区间外（如按空格）即渲染预览）
function selectionInside(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from < to && r.to > from) return true;
  }
  return false;
}

// HTML 或行内 Markdown 刚输入完闭合标记时，折叠光标会恰好位于装饰范围的右边界。
// 此时先保留源码；用户继续输入一个字符后，光标自然越过范围，再切换为预览。
// 这样新文字会留在格式范围右侧，而不会在隐藏闭合标记时被浏览器重新映射到左侧。
function selectionTouchesInlineBoundary(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (range.head >= from && range.head <= to) return true;
    } else if (range.from < to && range.to > from) {
      return true;
    }
  }
  return false;
}

// 块级 Widget 的 range 须按行对齐：to 已在行首则直接用，否则扩到下一行起始（避免多吃一行）
export function blockEnd(state: EditorState, to: number, preserveFinalBlank = false): number {
  const ln = state.doc.lineAt(to);
  if (ln.from === to) return to; // to 已在行首
  // 表格后的最后一个空行是用户继续输入的落点。不要把它吞进 block replacement，
  // 否则状态栏有“下一行”，屏幕上却没有可见光标。
  if (preserveFinalBlank && ln.number < state.doc.lines) {
    const next = state.doc.line(ln.number + 1);
    if (next.number === state.doc.lines && next.text === '') return to;
  }
  return ln.number < state.doc.lines ? state.doc.line(ln.number + 1).from : state.doc.length;
}

export function build(state: EditorState, waitForParse = true): DecorationSet {
  tokenData(state).currentBases.clear();
  try {
    return buildUnsafe(state, waitForParse);
  } catch (e) {
    console.error('[live-preview] build 失败：', e);
    return Decoration.none;
  }
}

// 引用块（FR-2.2）：行内元素用 line 装饰加左侧竖条+缩进（不与行内 mark 冲突），隐藏 `>` 标记
// Callout（Obsidian 风格）：首行 `[!TYPE]` 或 `[!TYPE]-` → 彩色标题卡；`-` 后缀可折叠
const CALLOTYPES = new Set([
  'note', 'tip', 'important', 'warning', 'caution', 'danger', 'info', 'question', 'success', 'failure', 'bug', 'example', 'quote', 'abstract', 'todo',
]);

function blockquoteDecos(state: EditorState, node: { from: number; to: number }, active: Set<number>, decos: Deco[]): void {
  const fromLine = state.doc.lineAt(node.from).number;
  const toLine = state.doc.lineAt(node.to).number;
  // 读取首行文本判断是否 callout
  const firstLine = state.doc.line(fromLine);
  const firstText = firstLine.text;
  const calloutMatch = firstText.match(/^\s*>+\s*\[!([A-Za-z]+)\]\s*-?\s*(.*)$/);
  const isCallout = !!(calloutMatch && CALLOTYPES.has(calloutMatch[1].toLowerCase()));
  const collapsible = isCallout && /^\s*>+\s*\[![A-Za-z]+\]-\s*/.test(firstText);
  const blockKey = `${documentId(state)}:${node.from}`;

  // callout：整个块左侧色条 + 首行标题 widget
  const calloutCls = isCallout ? ` md-callout md-callout-${calloutMatch![1].toLowerCase()}` : '';
  const collapsed = isCallout && collapsible && (collapsedBlocks.get(blockKey) === true);
  const collapsedBool = !!collapsed;

  for (let n = fromLine; n <= toLine; n++) {
    const line = state.doc.line(n);
    let i = line.from;
    let depth = 0;
    while (i < line.to && state.doc.sliceString(i, i + 1) === '>') {
      depth++;
      let end = i + 1;
      if (end < line.to && state.doc.sliceString(end, end + 1) === ' ') end++;
      decos.push({ from: i, to: end, dec: Decoration.replace({}) });
      i = end;
      while (i < line.to && state.doc.sliceString(i, i + 1) === ' ') i++;
    }
    // 折叠时隐藏内容行（保留首行标题）
    if (collapsed && n > fromLine) {
      decos.push({ from: line.from, to: line.from, dec: Decoration.line({ class: 'md-callout-collapsed' }) });
      continue;
    }
    const cls = `md-blockquote md-blockquote-${depth}${calloutCls}`;
    decos.push({ from: line.from, to: line.from, dec: Decoration.line({ class: cls }) });
  }

  // 首行标题：把整行 callout 标记与标题替换为 CalloutHeaderWidget（widget 内渲染类型+标题）
  if (isCallout) {
    const type = calloutMatch![1];
    const title = calloutMatch![2] || '';
    const firstLineNum = state.doc.lineAt(node.from).number;
    const fl = state.doc.line(firstLineNum);
    const headerStart = firstText.indexOf('[!');
    const absHeaderStart = fl.from + headerStart;
    // 替换到行尾（含标题文本），widget 内渲染类型徽标 + 标题
    const headerEnd = fl.to;
    decos.push({
      from: absHeaderStart, to: headerEnd,
      dec: Decoration.replace({
        widget: new CalloutHeaderWidget(type, title.trim(), collapsible, collapsedBool, blockKey, (key, widgetView) => {
          collapsedBlocks.set(key, !(collapsedBlocks.get(key) ?? false));
          widgetView.dispatch({ effects: recompute.of() });
        }),
      }),
    });
  }
}

// callout 折叠状态（按块起始位置记忆）
const collapsedBlocks = new Map<string, boolean>();

// 行内 HTML（FR-2 内嵌 HTML）：在段落内收集 HTMLTag，成对/自闭合替换为渲染结果
function inlineHtmlDecos(state: EditorState, active: Set<number>, tree = syntaxTree(state)): Deco[] {
  const decos: Deco[] = [];
  const perParent = new Map<number, { tag: string; close: boolean; self: boolean; from: number; to: number }[]>();
  tree.iterate({
    enter(node) {
      if (node.name !== 'HTMLTag') return;
      if (!INLINE_PARENTS.has(node.node.parent?.name ?? '')) return;
      const text = state.doc.sliceString(node.from, node.to);
      const m = text.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)/);
      if (!m) return;
      const tag = m[1].toLowerCase();
      const arr = perParent.get(node.node.parent!.from) ?? [];
      arr.push({
        tag,
        close: text.startsWith('</'),
        self: /\/\s*>$/.test(text) || VOID_HTML.has(tag),
        from: node.from,
        to: node.to,
      });
      perParent.set(node.node.parent!.from, arr);
    },
  });
  for (const arr of perParent.values()) {
    const stack: typeof arr = [];
    for (const n of arr) {
      if (n.close) {
        const open = stack.pop();
        if (open && open.tag === n.tag) {
          if (selectionTouchesInlineBoundary(state, open.from, n.to)) continue;
          decos.push({
            from: open.from,
            to: n.to,
            // 明确保持两端非 inclusive：在标签边界输入的文字不能被吸进 HTML 替换区。
            dec: Decoration.replace({
              widget: new HtmlWidget(state.doc.sliceString(open.from, n.to)),
              inclusive: false,
            }),
          });
        }
      } else if (n.self) {
        if (selectionTouchesInlineBoundary(state, n.from, n.to)) continue;
        decos.push({
          from: n.from,
          to: n.to,
          dec: Decoration.replace({
            widget: new HtmlWidget(state.doc.sliceString(n.from, n.to)),
            inclusive: false,
          }),
        });
      } else {
        stack.push(n);
      }
    }
  }
  return decos;
}

function buildUnsafe(state: EditorState, waitForParse: boolean): DecorationSet {
  const active = activeLines(state);
  const decos: Deco[] = [];
  const occupy: Range[] = [];

  // 强制同步解析整个文档（最多等待 50ms），确保行内格式节点（Strikethrough/HTMLTag/Emphasis 等）存在。
  // 大文档异步解析未完成时，syntaxTree(state) 返回的树可能缺失节点，导致 ~~删除线~~、<u>下划线</u> 等不渲染预览。
  // 测试用例使用 EditorState.create 创建小文档，语法树同步解析完成，所以测试通过但生产环境出问题。
  const tree = waitForParse
    ? ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state)
    : syntaxTree(state);
  tree.iterate({
    enter(node) {
      const name = node.name;

      if (name === 'FencedCode') {
        const to = blockEnd(state, node.to);
        occupy.push({ from: node.from, to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        // 语言标签含特殊字符（c++ / c# / yaml/yml 等）：捕获首个非空 token，而非仅 \w
        const m = text.match(/^```([^\r\n]*)\r?\n([\s\S]*?)\r?\n?```\s*$/);
        if (m) {
          const lang = (m[1] || '').trim().split(/\s+/)[0] || '';
          // mermaid 代码块 → 渲染为图表（用户需求）
          if (lang === 'mermaid') {
            decos.push({ from: node.from, to, dec: Decoration.replace({ widget: new MermaidWidget(m[2].replace(/\n$/, ''), node.from), block: true }) });
            return false;
          }
          if (lang === 'dataview') {
            decos.push({ from: node.from, to, dec: Decoration.replace({ widget: new DataviewWidget(m[2].replace(/\n$/, ''), node.from), block: true }) });
            return false;
          }
          // 普通代码块：逐行渲染（保持行可导航/可选/对齐行号，而非 block 替换 widget）
          const code = m[2].replace(/\n$/, '');
          const codeStart = node.from + m[1].length + 4; // ```lang\n 之后
          scheduleCodeTokens(state, codeStart, code, lang);
          // 每一行都套深色背景（含 ```lang 行与闭合 ``` 行）
          const firstLn = state.doc.lineAt(node.from).number;
          const lastLn = state.doc.lineAt(node.to).number;
          for (let n = firstLn; n <= lastLn; n++) {
            const ln = state.doc.line(n);
            let cls = 'md-code-line';
            if (n === firstLn) cls += ' md-code-line-first';
            if (n === lastLn) cls += ' md-code-line-last';
            decos.push({ from: ln.from, to: ln.from, dec: Decoration.line({ class: cls }) });
          }
          // 隐藏开闭围栏标记：开头 ```lang 与结尾 ```（代码内容保留，围栏行仍是独立深色行）
          const openEnd = node.from + m[1].length + 3; // 仅 ```lang，不含换行
          decos.push({ from: node.from, to: openEnd, dec: Decoration.replace({}) });
          const closeFrom = node.to - 3;
          if (closeFrom >= openEnd) {
            decos.push({ from: closeFrom, to: node.to, dec: Decoration.replace({}) });
          }
          // 语言标签 + 复制按钮（悬浮于代码块右上角）
          decos.push({ from: node.from, to: node.from, dec: Decoration.widget({ widget: new CodeBlockLabelWidget(lang, code), side: 1 }) });
        }
        return false;
      }

      if (name === 'CodeBlock') { // 4 空格缩进代码块（FR-4.6）
        const to = blockEnd(state, node.to);
        occupy.push({ from: node.from, to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const code = state.doc.sliceString(node.from, node.to).replace(/^ {4}/gm, '');
        scheduleCodeTokens(state, node.from, code, '');
        const firstLn = state.doc.lineAt(node.from).number;
        const lastLn = state.doc.lineAt(node.to).number;
        for (let n = firstLn; n <= lastLn; n++) {
          const ln = state.doc.line(n);
          decos.push({ from: ln.from, to: ln.from, dec: Decoration.line({ class: 'md-code-line' }) });
        }
        return false;
      }

      if (name === 'Blockquote') {
        if (overlapsLine(state, node.from, node.to, active)) return false;
        blockquoteDecos(state, node, active, decos);
        return false; // 不重复处理嵌套引用（标记已统一隐藏）
      }

      if (name === 'HTMLBlock') {
        const to = blockEnd(state, node.to);
        occupy.push({ from: node.from, to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const html = state.doc.sliceString(node.from, node.to);
        decos.push({ from: node.from, to, dec: Decoration.replace({ widget: new HtmlWidget(html), block: true }) });
        return false;
      }

      if (name === 'HorizontalRule') {
        // 分割线：inline replace 隐藏 --- 标记 + line decoration 画线（与代码块围栏一致）。
        // 旧实现用 block:true，会让光标移动命令（cursorLineUp/Down）跳过该行（block widget 对垂直导航原子化）。
        // 改为 inline + line 后，光标能正常停留在 HR 行，overlapsLine 才能真正生效（光标在行上时显示源码）。
        occupy.push({ from: node.from, to: node.to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        decos.push({ from: node.from, to: node.to, dec: Decoration.replace({}) });
        decos.push({ from: node.from, to: node.from, dec: Decoration.line({ class: 'md-hr-line' }) });
        return false;
      }

      if (name === 'Table') {
        const to = blockEnd(state, node.to, true);
        occupy.push({ from: node.from, to });
        // 始终渲染预览模式（用户偏好预览编辑，双击单元格编辑内容）
        const src = state.doc.sliceString(node.from, node.to);
        const rowCount = src.split('\n').filter((l) => l.trim() !== '' && !/^\s*\|?\s*:?-+:?\s*\|?\s*$/.test(l.trim())).length;
        if (rowCount < 1) return false; // 无表头不渲染
        decos.push({ from: node.from, to, dec: Decoration.replace({ widget: new TableWidget(src, node.from), block: true }) });
        return false;
      }

      if (name === 'Image') {
        occupy.push({ from: node.from, to: node.to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        const mm = text.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
        if (mm) decos.push({ from: node.from, to: node.to, dec: Decoration.replace({ widget: new ImageWidget(mm[1], mm[2], node.from) }) });
        return false;
      }

      if (/^ATXHeading[1-6]$/.test(name)) {
        occupy.push({ from: node.from, to: node.to });
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        const m = text.match(/^(#{1,6})\s+/);
        if (m) {
          const prefixLen = m[0].length;
          const markFrom = node.from;
          const markTo = node.from + prefixLen;
          decos.push({ from: markFrom, to: markTo, dec: Decoration.replace({}) });
          decos.push({ from: markTo, to: node.to, dec: Decoration.mark({ class: `md-h${m[1].length}` }) });
        }
        return false;
      }

      if (name === 'TaskMarker') {
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        const checked = /x/i.test(text);
        decos.push({ from: node.from, to: node.to, dec: Decoration.replace({ widget: new CheckboxWidget(node.from, node.to, checked) }) });
        return false;
      }

      // 列表标记（FR-2.3）：无序列表 → 圆点，有序列表 → 数字；光标行保持源码
      if (name === 'ListMark') {
        if (overlapsLine(state, node.from, node.to, active)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        const ordered = /^\s*\d+[.)]/.test(text);
        const marker = ordered ? text.trim() : '•';
        decos.push({ from: node.from, to: node.to, dec: Decoration.replace({ widget: new ListMarkWidget(marker) }) });
        return false;
      }

      if (INLINE_PARENTS.has(node.node.parent?.name ?? '')) {
        if (name === 'Link') {
          if (selectionInside(state, node.from, node.to)) return false;
          occupy.push({ from: node.from, to: node.to });
          const text = state.doc.sliceString(node.from, node.to);
          const lm = text.match(/^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
          if (lm) decos.push({ from: node.from, to: node.to, dec: Decoration.replace({ widget: new LinkWidget(lm[1], lm[2]) }) });
          return false;
        }
        if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode') {
          // 光标在区间内或刚完成闭合标记、位于右边界时保留源码。
          // 再输入一个字符后光标越过范围，才隐藏标记并渲染预览，避免 IME 在
          // replace 装饰边界提交文字时把 DOM 光标映射回新文字左侧。
          if (selectionTouchesInlineBoundary(state, node.from, node.to)) return false;
          const text = state.doc.sliceString(node.from, node.to);
          const parent = node.node.parent;
          const parentName = parent?.name ?? '';
          // ***斜粗体***：外层 Emphasis 包裹内层 StrongEmphasis，二者共享 *** 标记。
          // 只处理外层（Emphasis 且 text 是 ***...***），内层 StrongEmphasis 跳过避免重复。
          if (name === 'StrongEmphasis' && parentName === 'Emphasis') return false;
          let markerLen = 0; let cls = '';
          if (name === 'Emphasis' && /^\*{3}.*\*{3}$/.test(text) && INLINE_PARENTS.has(parentName)) {
            markerLen = 3; cls = 'md-bold md-italic';
          } else if (name === 'StrongEmphasis') { markerLen = 2; cls = 'md-bold'; }
          else if (name === 'Emphasis') { markerLen = 1; cls = 'md-italic'; }
          else if (name === 'Strikethrough') { markerLen = 2; cls = 'md-strike'; }
          else { markerLen = (text.match(/^`+/) || ['`'])[0].length; cls = 'md-code-inline'; }
          const innerFrom = node.from + markerLen;
          const innerTo = node.to - markerLen;
          if (innerTo > innerFrom) {
            occupy.push({ from: innerFrom, to: innerTo });
            decos.push({ from: innerFrom, to: innerTo, dec: Decoration.mark({ class: cls }) });
          }
          decos.push({ from: node.from, to: node.from + markerLen, dec: Decoration.replace({}) });
          decos.push({ from: node.to - markerLen, to: node.to, dec: Decoration.replace({}) });
          return false;
        }
      }
      return undefined;
    },
  });

  const htmlDecos = inlineHtmlDecos(state, active, tree);
  for (const h of htmlDecos) occupy.push({ from: h.from, to: h.to });
  decos.push(...htmlDecos);

  const text = state.doc.toString();
  const blockRe = /\$\$([\s\S]+?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text))) {
    const from = m.index, contentTo = m.index + m[0].length;
    if (insideAny(from, contentTo, occupy)) continue;
    // 块级公式：光标仍在块内任意行（含刚输入完闭合 $$ 的边界）→ 保持源码，
    // 否则整块被替换成渲染组件、源码消失（用户输入 4 个 $ 时看不到内容）。
    if (overlapsLine(state, from, contentTo, active)) continue;
    const atLineStart = from === 0 || text[from - 1] === '\n';
    if (atLineStart) {
      const to = blockEnd(state, contentTo);
      occupy.push({ from, to });
      decos.push({ from, to, dec: Decoration.replace({ widget: new BlockMathWidget(m[1], from), block: true }) });
    } else {
      occupy.push({ from, to: contentTo });
      decos.push({ from, to: contentTo, dec: Decoration.replace({ widget: new BlockMathWidget(m[1], from) }) });
    }
  }

  const inlineRe = /\$([^\$\n]+?)\$/g;
  while ((m = inlineRe.exec(text))) {
    const from = m.index, to = m.index + m[0].length;
    if (insideAny(from, to, occupy)) continue;
    if (selectionInside(state, from, to)) continue;
    decos.push({ from, to, dec: Decoration.replace({ widget: new InlineMathWidget(m[1], from) }) });
  }

  // ==高亮==（用户需求）：非活跃时隐藏 == 标记、正文套 md-highlight
  const hlRe = /==([^=\n]+?)==/g;
  while ((m = hlRe.exec(text))) {
    const from = m.index, to = m.index + m[0].length;
    if (insideAny(from, to, occupy)) continue;
    if (selectionTouchesInlineBoundary(state, from, to)) continue;
    decos.push({ from, to: from + 2, dec: Decoration.replace({}) });
    decos.push({ from: from + 2, to: to - 2, dec: Decoration.mark({ class: 'md-highlight' }) });
    decos.push({ from: to - 2, to, dec: Decoration.replace({}) });
    occupy.push({ from, to });
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const d of decos) {
    if (d.from < lastTo) continue;
    builder.add(d.from, d.to, d.dec);
    lastTo = Math.max(lastTo, d.to);
  }
  return builder.finish();
}

export const livePreview = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    const composing = tr.state.field(compositionActive, false) === true
      || tr.isUserEvent('input.type.compose');
    if (tr.docChanged) {
      const data = tokenData(tr.state);
      // 文档变化：映射 tokenStore 各条目的 base 偏移（保留近似着色，防闪烁），递增代际，清空缓存
      // 不清空 tokenStore —— 旧 token 偏移经 mapPos 映射后仍近似正确，异步重新着色到达后平滑替换
      if (data.store.size > 0) {
        const mapped = new Map<number, TokenLine[]>();
        for (const [base, tokens] of data.store) mapped.set(tr.changes.mapPos(base), tokens);
        data.store.clear();
        for (const [key, value] of mapped) data.store.set(key, value);
      }
      data.gen++;
      data.cache.clear();
      // composition 的原生 DOM/选区仍由浏览器维护。这里只映射已有装饰，既不会把
      // 源码突然折叠成 widget，也不会把已有预览展开，从而同时避免光标错位和闪烁。
      if (composing) return deco.map(tr.changes);

      const result = build(tr.state);
      // 仅在 doc 变更时清理已删除代码块的过期条目（光标移动不会删除代码块，无需清理）
      for (const base of data.store.keys()) {
        if (!data.currentBases.has(base)) data.store.delete(base);
      }
      return result;
    }
    if (composing) return deco;
    if (tr.selection || tr.effects.some((e) => e.is(recompute))) {
      // 光标移动只需要使用已经可用的语法树重建装饰；完整解析由文档修改或
      // treeWatcher 的 recompute 负责，避免每次按方向键都同步等待 50ms。
      return build(tr.state, false);
    }
    return deco;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    // CodeMirror 要求被 replace 的范围同时作为 atomicRanges 提供，才能在浏览器把
    // DOM 光标映射到 widget 内部时，将输入可靠地校正到替换区的正确一侧。
    // 这里只收集 HtmlWidget，避免让普通高亮/隐藏标记也变成不可逐字导航的原子范围。
    EditorView.atomicRanges.of((view) => {
      const builder = new RangeSetBuilder<Decoration>();
      view.state.field(field).between(0, view.state.doc.length, (from, to, decoration) => {
        if (from < to && decoration.spec.widget instanceof HtmlWidget) {
          builder.add(from, to, decoration);
        }
      });
      return builder.finish();
    }),
  ],
});

// 从当前文档的 tokenStore 重建代码块着色装饰。
function buildTokenDecos(data: TokenDocumentData): DecorationSet {
  const ranges: { from: number; to: number; dec: Decoration }[] = [];
  for (const [base, lines] of data.store) {
    for (const line of lines) {
      for (const t of line.tokens) {
        const from = base + t.offset;
        const to = from + t.content.length;
        if (to > from) ranges.push({ from, to, dec: Decoration.mark({ attributes: { style: `color: ${t.color}` } }) });
      }
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const r of ranges) {
    if (r.from < lastTo) continue; // RangeSetBuilder 不允许重叠
    builder.add(r.from, r.to, r.dec);
    lastTo = Math.max(lastTo, r.to);
  }
  return builder.finish();
}

// 代码块 token 着色装饰：异步收到 token 后叠加 mark（颜色 span），保持源码行可导航。
// 与 livePreview 的 line/mark 装饰分别 provide，CM6 会合并展示。
export const codeTokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const data = tokenData(tr.state);
    if (tr.docChanged) {
      // tokenStore 的 base 已由 livePreview.update（同事务先执行）通过 mapPos 映射，
      // 重建装饰保留近似着色（防闪烁），异步重新着色到达后平滑替换
      return buildTokenDecos(data);
    }
    const e = tr.effects.find((x) => x.is(codeTokens)) as
      | (ReturnType<typeof codeTokens.of> & { value: { base: number; tokens: TokenLine[]; gen: number } })
      | undefined;
    if (!e) return deco;
    // 丢弃过期代际的 effect（文档已变更，旧 base 偏移失效）
    if (e.value.gen !== data.gen) return deco;
    // 累积到 tokenStore 后从全量重建，避免多代码块互相覆盖
    data.store.set(e.value.base, e.value.tokens);
    return buildTokenDecos(data);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---- 测试专用导出（仅用于验证多代码块 token 累积与代际防竞态逻辑）----
export function _testApplyTokens(base: number, tokens: TokenLine[]): void {
  tokenData(0).store.set(base, tokens);
}
export function _testBuildTokenDecos(): DecorationSet {
  return buildTokenDecos(tokenData(0));
}
export function _testClearTokenStore(): void {
  tokenData(0).store.clear();
}
export function _testCodeGen(): number { return tokenData(0).gen; }
export function _testBumpGen(): void { tokenData(0).gen++; }
export function _testMakeCodeTokenEffect(base: number, tokens: TokenLine[], gen: number) {
  return codeTokens.of({ base, tokens, gen });
}
// 模拟 livePreview.update 在 doc 变更时的 base 映射（单测无 EditorView 驱动语法树解析，无法走完整 update 流程）
export function _testMapBases(mapPos: (pos: number) => number): void {
  const data = tokenData(0);
  const mapped = new Map<number, TokenLine[]>();
  for (const [base, tokens] of data.store) mapped.set(mapPos(base), tokens);
  data.store.clear();
  for (const [key, value] of mapped) data.store.set(key, value);
}
