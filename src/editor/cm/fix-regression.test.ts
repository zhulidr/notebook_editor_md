import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import type { DecorationSet, Decoration } from '@codemirror/view';
import { build, _testApplyTokens, _testBuildTokenDecos, _testClearTokenStore, codeTokenField, _testMakeCodeTokenEffect, _testCodeGen, _testBumpGen, _testMapBases } from './live-preview';
import { sanitizeHtml } from '../widgets/html';
import type { TokenLine } from '../../highlight/shiki';

function st(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ extensions: [GFM] })],
  });
}

interface D { from: number; to: number; block: boolean; widget?: string; cls?: string; }
function decos(set: DecorationSet, docLen: number): D[] {
  const out: D[] = [];
  set.between(0, docLen, (from: number, to: number, value: Decoration) => {
    const s = value.spec as { block?: boolean; widget?: { constructor: { name: string } }; class?: string };
    out.push({ from, to, block: !!s.block, widget: s.widget?.constructor?.name, cls: s.class });
  });
  return out;
}

describe('修复：围栏语言含特殊字符（Bug A）', () => {
  const atEnd = (doc: string) => st(doc, doc.length);
  // 代码块改为逐行渲染：每行有 md-code-line 行装饰（保持行号/导航/选择），并生成语言标签 widget
  it('c++ 语言 → 生成 md-code-line 行装饰', () => {
    const d = decos(build(atEnd('```c++\nint x=1;\n```\n\n正文')), 23);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(true);
    expect(d.some((x) => x.widget === 'CodeBlockLabelWidget')).toBe(true);
  });
  it('c# 语言 → 生成 md-code-line 行装饰', () => {
    const d = decos(build(atEnd('```c#\nint x=1;\n```\n\n正文')), 23);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(true);
  });
  it('scss/sass 语言 → 生成 md-code-line 行装饰（首 token scss）', () => {
    const d = decos(build(atEnd('```scss\n$a: red;\n```\n\n正文')), 24);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(true);
  });
  it('语言后带空格属性 → 只取首 token', () => {
    const d = decos(build(atEnd('```js {linenos=true}\nconst x=1;\n```\n\n正文')), 35);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(true);
  });
  it('无语言标签 → 仍生成 md-code-line 行装饰', () => {
    const d = decos(build(atEnd('```\ncode\n```\n\n正文')), 16);
    expect(d.some((x) => x.cls?.includes('md-code-line'))).toBe(true);
  });
});

describe('修复：列表标记渲染（Bug B）', () => {
  it('无序列表光标离开 → ListMarkWidget 圆点', () => {
    const doc = '- 第一项\n- 第二项\n\n正文';
    const s = st(doc, doc.length);
    const d = decos(build(s), s.doc.length);
    const mark = d.find((x) => x.widget === 'ListMarkWidget');
    expect(mark, '应有 ListMarkWidget').toBeTruthy();
  });
  it('有序列表 → ListMarkWidget（数字标记）', () => {
    const doc = '1. 第一项\n2. 第二项\n\n正文';
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'ListMarkWidget')).toBe(true);
  });
  it('光标在列表行内 → 不渲染（源码）', () => {
    const s = st('- 第一项', 2);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'ListMarkWidget')).toBe(false);
  });
  it('任务列表 - [ ] → 保留 Checkbox + 圆点标记', () => {
    const doc = '- [ ] 待办\n- [x] 完成\n\n正文';
    const s = st(doc, doc.length);
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.widget === 'CheckboxWidget')).toBe(true);
    expect(d.some((x) => x.widget === 'ListMarkWidget')).toBe(true);
  });
});

describe('修复：行内公式输入完按空格即渲染预览（用户需求）', () => {
  it('光标在 $…$ 区间外（开头）→ 渲染 InlineMathWidget', () => {
    const s = st('$A \\times B$', 0);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'InlineMathWidget')).toBe(true);
  });
  it('光标在 $…$ 区间外（结尾）→ 渲染（输入完成即预览）', () => {
    const s = st('$A \\times B$', 12);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'InlineMathWidget')).toBe(true);
  });
  it('光标在 $…$ 区间内 → 保持源码', () => {
    const s = st('$A \\times B$', 3);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'InlineMathWidget')).toBe(false);
  });
  it('光标在区间外但行内有其他公式 → 只渲染该公式', () => {
    const s = st('文字 $A$ 其他 $B$', 0);
    const d = decos(build(s), s.doc.length).filter((x) => x.widget === 'InlineMathWidget');
    expect(d.length).toBe(2);
  });
});

describe('修复：块级公式输入完 4 个 $ 时源码不消失（用户需求）', () => {
  const doc = '$$\n\\int x dx\n$$';
  it('光标在闭合 $$ 末尾 → 保持源码（不渲染成组件）', () => {
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'BlockMathWidget')).toBe(false);
  });
  it('光标在块内行 → 保持源码', () => {
    const s = st(doc, 5); // 在 \int x dx 行
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'BlockMathWidget')).toBe(false);
  });
  it('光标离开块（下方新行）→ 渲染 BlockMathWidget', () => {
    const s = st(doc + '\n\n正文', doc.length + 2);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'BlockMathWidget')).toBe(true);
  });
});

describe('修复：行内标记光标在区间外即渲染（用户需求：按空格/回车转预览）', () => {
  it('**加粗** 光标在末尾 → 渲染 md-bold', () => {
    const s = st('**加粗** ', 7);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-bold'))).toBe(true);
  });
  it('**加粗** 光标在区间内 → 保持源码', () => {
    const s = st('**加粗** ', 3);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-bold'))).toBe(false);
  });
  it('*斜体* 光标在末尾 → 渲染 md-italic', () => {
    const s = st('*斜体* ', 5);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-italic'))).toBe(true);
  });
  it('~~删除线~~ 光标在末尾 → 渲染 md-strike', () => {
    const s = st('~~删除线~~ ', 8);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-strike'))).toBe(true);
  });
  it('`行内代码` 光标在末尾 → 渲染 md-code-inline', () => {
    const s = st('`行内代码` ', 7);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-code-inline'))).toBe(true);
  });
  it('==高亮== 光标在末尾 → 渲染 md-highlight', () => {
    const s = st('==高亮== ', 7);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-highlight'))).toBe(true);
  });
  it('==高亮== 光标在区间内 → 保持源码', () => {
    const s = st('==高亮== ', 3);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-highlight'))).toBe(false);
  });
  it('***斜粗体*** 光标在末尾 → 同时渲染 md-bold + md-italic', () => {
    const s = st('***斜粗体*** ', 10);
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.cls?.includes('md-bold'))).toBe(true);
    expect(d.some((x) => x.cls?.includes('md-italic'))).toBe(true);
  });
});

describe('修复：分割线 / 表格预览（用户需求）', () => {
  it('--- 光标离开 → 渲染 md-hr-line（inline + line deco，光标可正常经过）', () => {
    const s = st('---\n\n正文', 6);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-hr-line'))).toBe(true);
  });
  it('*** 光标离开 → 渲染 md-hr-line', () => {
    const s = st('***\n\n正文', 6);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-hr-line'))).toBe(true);
  });
  it('___ 光标离开 → 渲染 md-hr-line', () => {
    const s = st('___\n\n正文', 6);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-hr-line'))).toBe(true);
  });
  it('--- 光标在本行 → 保持源码（无 md-hr-line 装饰）', () => {
    const s = st('---', 1);
    expect(decos(build(s), s.doc.length).some((x) => x.cls?.includes('md-hr-line'))).toBe(false);
  });
  it('表格 表头+分隔线（无数据行）光标远离 → 渲染 TableWidget', () => {
    const doc = '| a | b |\n|---|---|\n\n正文';
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'TableWidget')).toBe(true);
  });
  it('表格 完整（含数据行）光标远离 → 渲染 TableWidget', () => {
    const doc = '| a | b |\n|---|---|\n| 1 | 2 |\n\n正文';
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'TableWidget')).toBe(true);
  });
});

describe('修复：代码块圆角 + Callout 折叠（用户需求）', () => {
  it('代码块首行 → md-code-line-first（圆角顶）', () => {
    const doc = '```js\ncode\n```\n\n正文';
    const s = st(doc, doc.length);
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.cls?.includes('md-code-line-first'))).toBe(true);
    expect(d.some((x) => x.cls?.includes('md-code-line-last'))).toBe(true);
  });
  it('Callout [!NOTE]- → 生成 CalloutHeaderWidget', () => {
    const doc = '> [!NOTE]- 答案\n> 内容\n\n正文';
    const s = st(doc, doc.length);
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.widget === 'CalloutHeaderWidget')).toBe(true);
  });
  it('Callout [!TIP]（无折叠）→ 也生成 CalloutHeaderWidget', () => {
    const doc = '> [!TIP] 提示\n> 内容\n\n正文';
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'CalloutHeaderWidget')).toBe(true);
  });
  it('普通引用（非 callout）→ 不生成 CalloutHeaderWidget', () => {
    const doc = '> 普通引用\n> 内容\n\n正文';
    const s = st(doc, doc.length);
    expect(decos(build(s), s.doc.length).some((x) => x.widget === 'CalloutHeaderWidget')).toBe(false);
  });
});

describe('修复：多代码块 token 着色累积（Bug 1：codeTokenField 仅保留最后一块颜色）', () => {
  // codeTokenField.update 收到每个 codeTokens effect 时只构建本次 builder，丢弃前一块。
  // 修复后应累积到 tokenStore，从全量重建，保证多块颜色并存。
  interface Tok { content: string; offset: number; color: string; }
  function makeTokens(color: string, ...toks: [string, number][]): { tokens: Tok[]; fg: string; bg: string } {
    return { tokens: toks.map(([content, offset]) => ({ content, offset, color })), fg: color, bg: '#000' };
  }
  function ranges(set: DecorationSet): number[] {
    const out: number[] = [];
    set.between(0, 100000, (from) => { out.push(from); });
    return out;
  }

  it('单代码块 → 着色范围存在', () => {
    _testClearTokenStore();
    _testApplyTokens(10, [makeTokens('#fff', ['foo', 0])]);
    const r = ranges(_testBuildTokenDecos());
    expect(r).toContain(10);
  });

  it('多代码块 → 两块 token 都保留（核心修复点）', () => {
    _testClearTokenStore();
    _testApplyTokens(10, [makeTokens('#fff', ['foo', 0])]);
    _testApplyTokens(80, [makeTokens('#0f0', ['bar', 0])]);
    const r = ranges(_testBuildTokenDecos());
    expect(r).toContain(10);
    expect(r).toContain(80);
  });

  it('同 base 再次写入 → 覆盖旧 token（代码块内容变更）', () => {
    _testClearTokenStore();
    _testApplyTokens(50, [makeTokens('#fff', ['old', 0])]);
    _testApplyTokens(50, [makeTokens('#0f0', ['new', 0])]);
    const set = _testBuildTokenDecos();
    const all: string[] = [];
    set.between(0, 1000, (_f, _t, v: Decoration) => {
      const style = (v.spec as { attributes?: { style?: string } }).attributes?.style ?? '';
      all.push(style);
    });
    expect(all.some((s) => s.includes('#0f0'))).toBe(true);
    expect(all.some((s) => s.includes('#fff'))).toBe(false);
  });

  it('清空后无装饰', () => {
    _testApplyTokens(10, [makeTokens('#fff', ['x', 0])]);
    _testClearTokenStore();
    expect(ranges(_testBuildTokenDecos()).length).toBe(0);
  });
});

describe('sanitizeHtml（XSS 白名单消毒）', () => {
  it('安全标签 <mark> 保留', () => {
    expect(sanitizeHtml('<mark>x</mark>')).toBe('<mark>x</mark>');
  });
  it('script 标签移除', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).not.toContain('<script');
  });
  it('事件属性 onerror 移除（空格分隔）', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).toContain('src="x"');
  });
  it('事件属性 onerror 移除（斜杠分隔 <img/onerror=>）', () => {
    const out = sanitizeHtml('<img/onerror="alert(1)" src="x">');
    expect(out).not.toContain('onerror');
  });
  it('javascript: 协议替换为 #', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });
  it('无引号 javascript: 协议同样被替换', () => {
    const out = sanitizeHtml('<a href=javascript:alert(1)>x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });
  it('保留用户需要的安全颜色样式，丢弃危险 CSS', () => {
    const out = sanitizeHtml('<span style="color: red; background-image: url(javascript:alert(1))">M</span>');
    expect(out).toContain('color: red');
    expect(out).not.toContain('url(');
  });
  it('data: 协议替换为 #', () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>">');
    expect(out).not.toContain('data:');
  });
  it('嵌套标签混淆 <scr<script>ipt> 循环移除', () => {
    const out = sanitizeHtml('<scr<script>ipt>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<scr');
  });
  it('iframe 移除', () => {
    expect(sanitizeHtml('<iframe src="evil"></iframe>')).not.toContain('<iframe');
  });
});

describe('修复：代际防竞态（Bug 9：异步 token 到达时文档已变更，旧 base 偏移失效）', () => {
  function makeTokens(color: string, ...toks: [string, number][]): TokenLine[] {
    return [{ tokens: toks.map(([content, offset]) => ({ content, offset, color })), fg: color, bg: '#000' }];
  }
  function decoCount(set: DecorationSet): number {
    let n = 0;
    set.between(0, 100000, () => { n++; });
    return n;
  }

  it('当前代际 effect 被接受', () => {
    _testClearTokenStore();
    const gen = _testCodeGen();
    const s0 = EditorState.create({ extensions: [codeTokenField] });
    const tr = s0.update({ effects: _testMakeCodeTokenEffect(10, makeTokens('#fff', ['foo', 0]), gen) });
    expect(decoCount(tr.state.field(codeTokenField))).toBeGreaterThan(0);
  });

  it('过期代际 effect 被丢弃（文档已变更，旧 base 偏移失效）', () => {
    _testClearTokenStore();
    const oldGen = _testCodeGen();
    _testBumpGen(); // 模拟文档变更：代际递增
    _testClearTokenStore();
    const s0 = EditorState.create({ extensions: [codeTokenField] });
    const tr = s0.update({ effects: _testMakeCodeTokenEffect(10, makeTokens('#fff', ['stale', 0]), oldGen) });
    expect(decoCount(tr.state.field(codeTokenField))).toBe(0);
  });

  it('文档变更后新代际 effect 被接受', () => {
    _testClearTokenStore();
    _testBumpGen();
    const newGen = _testCodeGen();
    const s0 = EditorState.create({ extensions: [codeTokenField] });
    const tr = s0.update({ effects: _testMakeCodeTokenEffect(20, makeTokens('#0f0', ['fresh', 0]), newGen) });
    expect(decoCount(tr.state.field(codeTokenField))).toBeGreaterThan(0);
  });
});

describe('修复：doc 变更后 per-token 着色保留（Bug 10：防闪烁）', () => {
  function makeTokens(color: string, ...toks: [string, number][]): TokenLine[] {
    return [{ tokens: toks.map(([content, offset]) => ({ content, offset, color })), fg: color, bg: '#000' }];
  }
  function decoCount(set: DecorationSet): number {
    let n = 0;
    set.between(0, 100000, () => { n++; });
    return n;
  }

  it('base 映射后 per-token 装饰保留（代码块前插入，base 偏移）', () => {
    _testClearTokenStore();
    // 模拟异步着色到达：base=6
    _testApplyTokens(6, makeTokens('#fff', ['foo', 0]));
    expect(decoCount(_testBuildTokenDecos())).toBeGreaterThan(0);
    // 模拟 doc 变更：在位置 0 插入 1 字符，base 6 → 7
    _testMapBases((pos) => pos + 1);
    // per-token 着色应保留（映射后 base=7），不应闪烁为空
    expect(decoCount(_testBuildTokenDecos())).toBeGreaterThan(0);
  });

  it('base 映射后多代码块 per-token 装饰均保留', () => {
    _testClearTokenStore();
    _testApplyTokens(6, makeTokens('#fff', ['foo', 0]));
    _testApplyTokens(20, makeTokens('#0f0', ['bar', 0]));
    // 模拟 doc 变更：在位置 0 插入 2 字符，所有 base +2
    _testMapBases((pos) => pos + 2);
    const decos = _testBuildTokenDecos();
    expect(decoCount(decos)).toBeGreaterThanOrEqual(2);
  });

  it('base 不变（代码块内编辑，插入位置在 base 之后）', () => {
    _testClearTokenStore();
    _testApplyTokens(6, makeTokens('#fff', ['foo', 0]));
    // 模拟 doc 变更：在位置 8 插入（base=6 之后），mapPos(6)=6
    _testMapBases((pos) => pos >= 8 ? pos + 1 : pos);
    expect(decoCount(_testBuildTokenDecos())).toBeGreaterThan(0);
  });
});

// Bug 11：行内格式（下划线、删除线、高亮）光标离开后不显示预览
// 根因：treeWatcher 仅在 viewportChanged 时检测语法树完整性，异步解析完成但不刷新装饰；
//       buildUnsafe 直接用 syntaxTree(state) 可能获取不完整树，导致 HTMLTag/Strikethrough 节点缺失。
// 修复：treeWatcher 改为检测语法树对象引用变化；buildUnsafe/inlineHtmlDecos 调用 ensureSyntaxTree 强制同步解析。
describe('修复：行内格式光标离开后渲染预览（Bug 11）', () => {
  it('<u>下划线</u> 光标在区间外（末尾）→ 渲染 HtmlWidget', () => {
    const doc = '<u>下划线</u> ';
    const s = st(doc, doc.length);
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.widget === 'HtmlWidget')).toBe(true);
  });

  it('<u>下划线</u> 光标在区间内 → 保持源码（不渲染 HtmlWidget）', () => {
    const doc = '<u>下划线</u> ';
    const s = st(doc, 3); // 光标在 "下划线" 中间
    const d = decos(build(s), s.doc.length);
    expect(d.some((x) => x.widget === 'HtmlWidget')).toBe(false);
  });

  it('<u>下划线</u> 光标离开后 → 再选中 → 应再次保持源码（无残留装饰）', () => {
    const doc = '<u>下划线</u> ';
    // 光标离开（区间外）→ 渲染 HtmlWidget
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.widget === 'HtmlWidget')).toBe(true);
    // 光标再回到区间内 → 应不渲染 HtmlWidget（旧装饰被清除，不残留）
    const sIn = st(doc, 3);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.widget === 'HtmlWidget')).toBe(false);
  });

  it('~~删除线~~ 光标离开后 → 再选中 → 应再次保持源码', () => {
    const doc = '~~删除线~~ ';
    // 光标离开（区间外）→ 渲染 md-strike
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.cls?.includes('md-strike'))).toBe(true);
    // 光标再回到区间内 → 应不渲染 md-strike
    const sIn = st(doc, 3);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.cls?.includes('md-strike'))).toBe(false);
  });

  it('==高亮== 光标离开后 → 再选中 → 应再次保持源码', () => {
    const doc = '==高亮== ';
    // 光标离开（区间外）→ 渲染 md-highlight
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.cls?.includes('md-highlight'))).toBe(true);
    // 光标再回到区间内 → 应不渲染 md-highlight
    const sIn = st(doc, 3);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.cls?.includes('md-highlight'))).toBe(false);
  });

  it('**加粗** 光标离开后 → 再选中 → 应再次保持源码', () => {
    const doc = '**加粗** ';
    // 光标离开（区间外）→ 渲染 md-bold
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.cls?.includes('md-bold'))).toBe(true);
    // 光标再回到区间内 → 应不渲染 md-bold
    const sIn = st(doc, 3);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.cls?.includes('md-bold'))).toBe(false);
  });

  it('*斜体* 光标离开后 → 再选中 → 应再次保持源码', () => {
    const doc = '*斜体* ';
    // 光标离开（区间外）→ 渲染 md-italic
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.cls?.includes('md-italic'))).toBe(true);
    // 光标再回到区间内 → 应不渲染 md-italic
    const sIn = st(doc, 2);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.cls?.includes('md-italic'))).toBe(false);
  });

  it('***斜粗体*** 光标离开后 → 再选中 → 应再次保持源码', () => {
    const doc = '***斜粗体*** ';
    // 光标离开（区间外）→ 同时渲染 md-bold + md-italic
    const sOut = st(doc, doc.length);
    const dOut = decos(build(sOut), sOut.doc.length);
    expect(dOut.some((x) => x.cls?.includes('md-bold'))).toBe(true);
    expect(dOut.some((x) => x.cls?.includes('md-italic'))).toBe(true);
    // 光标再回到区间内 → 应不渲染 md-bold/md-italic
    const sIn = st(doc, 4);
    const dIn = decos(build(sIn), sIn.doc.length);
    expect(dIn.some((x) => x.cls?.includes('md-bold'))).toBe(false);
    expect(dIn.some((x) => x.cls?.includes('md-italic'))).toBe(false);
  });
});
