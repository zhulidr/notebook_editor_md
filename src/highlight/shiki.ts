// Shiki 高亮器单例（ARCHITECTURE.md §7，需求 FR-4）
// 关键：所有语言 grammar 静态 import（而非运行时动态 import）。
// 实测 Tauri/WebView2 的自定义协议（http://tauri.localhost）下，运行时动态 import() 分块会挂起
// （fetch 正常但 import 超时），导致代码块一直 pending。静态 import 语法在构建期全部打进产物，
// 运行时无需任何 import()，规避该问题。代价是主包体积增大，换来桌面端可靠渲染。
import type { Highlighter } from 'shiki';
import { createHighlighter } from 'shiki';
import { ideaDarcula } from './idea-darcula';
import { obsidian } from './obsidian';
import { getCodeBg } from '../editor/cm/settings';

// 代码高亮主题类型：'idea' = IDEA Darcula，'obsidian' = Obsidian(Monokai)
export type CodeTheme = 'idea' | 'obsidian';

const HTML_THEME_KEY = 'md-editor:htmlCodeTheme';
const CODE_THEME_KEY = 'md-editor:codeBlockTheme';

// HTML 代码（html/xml）使用的主题
let htmlTheme: CodeTheme = (localStorage.getItem(HTML_THEME_KEY) as CodeTheme) || 'idea';
// 其他代码块使用的主题
let codeTheme: CodeTheme = (localStorage.getItem(CODE_THEME_KEY) as CodeTheme) || 'idea';

// 主题变更回调（live-preview 注册后，切换主题时触发重新着色）
const themeChangeListeners = new Set<() => void>();

function themeName(t: CodeTheme): string {
  return t === 'obsidian' ? 'obsidian' : 'idea-darcula';
}

// 根据语言选择主题：html/xml → htmlTheme，其他 → codeTheme
function resolveThemeForLang(lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === 'html' || l === 'xml' || l === 'vue' || l === 'jsx' || l === 'tsx') {
    return themeName(htmlTheme);
  }
  return themeName(codeTheme);
}

// ---- 浅色背景下 token 颜色自动加深 ----
// 暗色主题（IDEA Darcula / Obsidian）的 token 颜色为暗色背景设计，
// 当用户选择浅色/无背景时，过浅的颜色（如 #A9B7C6、#f8f8f2）在白色背景上不可见，
// 需要自动加深到可读程度。

function colorLuminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 0;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function darkenHex(hex: string, factor: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = Math.round(parseInt(m[1].slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(m[1].slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(m[1].slice(4, 6), 16) * factor);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// 判断当前代码块背景是否为浅色（透明背景时继承编辑器亮色模式）
function isLightCodeBg(): boolean {
  const { bg } = getCodeBg();
  if (bg === 'transparent' || bg === 'inherit') {
    return document.documentElement.getAttribute('data-theme') !== 'dark';
  }
  return colorLuminance(bg) > 0.5;
}

// 在浅色背景下加深过浅的 token 颜色
function adjustColorForBg(color: string | undefined, lightBg: boolean): string | undefined {
  if (!color || !lightBg) return color;
  if (!color.startsWith('#')) return color;
  if (colorLuminance(color) > 0.65) {
    return darkenHex(color, 0.35);
  }
  return color;
}

// 静态导入全部 grammar（用户常用语言全集）
import langHtml from '@shikijs/langs/html';
import langXml from '@shikijs/langs/xml';
import langCss from '@shikijs/langs/css';
import langScss from '@shikijs/langs/scss';
import langSass from '@shikijs/langs/sass';
import langLess from '@shikijs/langs/less';
import langStylus from '@shikijs/langs/stylus';
import langJs from '@shikijs/langs/javascript';
import langTs from '@shikijs/langs/typescript';
import langJsx from '@shikijs/langs/jsx';
import langTsx from '@shikijs/langs/tsx';
import langVue from '@shikijs/langs/vue';
import langMarkdown from '@shikijs/langs/markdown';
import langJson from '@shikijs/langs/json';
import langYaml from '@shikijs/langs/yaml';
import langToml from '@shikijs/langs/toml';
import langIni from '@shikijs/langs/ini';
import langDiff from '@shikijs/langs/diff';
import langLog from '@shikijs/langs/log';
import langSql from '@shikijs/langs/sql';
import langPython from '@shikijs/langs/python';
import langBash from '@shikijs/langs/bash';
import langShell from '@shikijs/langs/shellscript';
import langBat from '@shikijs/langs/bat';
import langPowerShell from '@shikijs/langs/powershell';
import langCmd from '@shikijs/langs/cmd';
import langDockerfile from '@shikijs/langs/dockerfile';
import langNginx from '@shikijs/langs/nginx';
import langJava from '@shikijs/langs/java';
import langC from '@shikijs/langs/c';
import langCpp from '@shikijs/langs/cpp';
import langCsharp from '@shikijs/langs/csharp';
import langPhp from '@shikijs/langs/php';
import langRuby from '@shikijs/langs/ruby';
import langRust from '@shikijs/langs/rust';
import langGo from '@shikijs/langs/go';
import langScala from '@shikijs/langs/scala';
import langKotlin from '@shikijs/langs/kotlin';
import langSwift from '@shikijs/langs/swift';
import langObjc from '@shikijs/langs/objective-c';
import langLua from '@shikijs/langs/lua';
import langPerl from '@shikijs/langs/perl';
import langR from '@shikijs/langs/r';
import langDart from '@shikijs/langs/dart';
import langErlang from '@shikijs/langs/erlang';
import langHaskell from '@shikijs/langs/haskell';
import langProtobuf from '@shikijs/langs/protobuf';
import langGraphql from '@shikijs/langs/graphql';
import langSolidity from '@shikijs/langs/solidity';
import langAsm from '@shikijs/langs/asm';
import langD from '@shikijs/langs/d';
import langElixir from '@shikijs/langs/elixir';
import langFsharp from '@shikijs/langs/fsharp';
import langGroovy from '@shikijs/langs/groovy';
import langClojure from '@shikijs/langs/clojure';
import langCmake from '@shikijs/langs/cmake';
import langMakefile from '@shikijs/langs/makefile';
import langZig from '@shikijs/langs/zig';
import langVb from '@shikijs/langs/vb';

// 常用语言别名 → Shiki 语言 ID（用户常写 golang/react/c++ 等，Shiki 不接受这些名字）
const LANG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  'golang': 'go',
  'react': 'jsx',
  'shell': 'shellscript',
  'sh': 'shellscript',
  'shellscript': 'shellscript',
  'yml': 'yaml',
  'js': 'javascript',
  'ts': 'typescript',
  'tsx': 'tsx',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'objective-c': 'objc',
  'objc': 'objc',
  'bash': 'shellscript',
  'jsx': 'jsx',
  'html5': 'html',
};

function resolveLang(lang: string): string {
  const key = lang.toLowerCase().trim();
  return LANG_ALIASES[key] ?? key;
}

// 预注册语言（全部静态导入，运行时无需动态 import）
const LANGS = [
  langHtml, langXml, langCss, langScss, langSass, langLess, langStylus,
  langJs, langTs, langJsx, langTsx, langVue, langMarkdown, langJson,
  langYaml, langToml, langIni, langDiff, langLog, langSql, langPython,
  langBash, langShell, langBat, langPowerShell, langCmd, langDockerfile,
  langNginx, langJava, langC, langCpp, langCsharp, langPhp, langRuby,
  langRust, langGo, langScala, langKotlin, langSwift, langObjc, langLua,
  langPerl, langR, langDart, langErlang, langHaskell, langProtobuf,
  langGraphql, langSolidity, langAsm, langD, langElixir, langFsharp,
  langGroovy, langClojure, langCmake, langMakefile, langZig, langVb,
];

let hl: Highlighter | null = null;
let initing: Promise<Highlighter> | null = null;
const loaded = new Set<string>();

async function getHighlighter(): Promise<Highlighter> {
  if (hl) return hl;
  if (!initing) {
    initing = (async () => {
      const h = await createHighlighter({ themes: [ideaDarcula, obsidian], langs: LANGS });
      h.getLoadedLanguages().forEach((l) => loaded.add(l));
      hl = h;
      return h;
    })().catch((e) => {
      console.error('[shiki] 初始化失败：', e);
      initing = null;
      throw e;
    });
  }
  return initing;
}

// 返回 shiki 生成的 HTML；未知语言返回 null（调用方按纯文本兜底，FR-4.3）
export async function highlight(code: string, lang: string): Promise<string | null> {
  try {
    const h = await getHighlighter();
    const resolved = resolveLang(lang);
    if (!resolved) return null;
    if (!loaded.has(resolved)) {
      try {
        await h.loadLanguage(resolved as never);
        loaded.add(resolved);
      } catch {
        return null; // 未知语言 → 纯文本兜底
      }
    }
    let html = h.codeToHtml(code, { lang: resolved, theme: resolveThemeForLang(lang) });
    // 浅色背景下：后处理 Shiki HTML，加深过浅的 token 颜色（正则替换内联 color 样式）
    if (isLightCodeBg()) {
      html = html.replace(/color:\s*(#[0-9a-fA-F]{6})/g, (_match, color) => {
        const adjusted = adjustColorForBg(color, true);
        return `color:${adjusted}`;
      });
    }
    return html;
  } catch (e) {
    console.error('[shiki] highlight 失败：', lang, e);
    return null;
  }
}

export interface TokenLine {
  // 每行：{content, offset(全文档偏移), color}[]，color 为当前主题着色
  tokens: { content: string; offset: number; color: string }[];
  fg: string;
  bg: string;
}

// 逐行返回着色 token（供 Live Preview 行内着色使用，保持源码行可导航/可选/对齐行号）
export async function highlightTokens(code: string, lang: string): Promise<TokenLine[] | null> {
  try {
    const h = await getHighlighter();
    const resolved = resolveLang(lang);
    if (!resolved) return null;
    if (!loaded.has(resolved)) {
      try {
        await h.loadLanguage(resolved as never);
        loaded.add(resolved);
      } catch {
        return null;
      }
    }
    const theme = resolveThemeForLang(lang);
    const res = h.codeToTokens(code, { lang: resolved as never, theme });
    const lightBg = isLightCodeBg();
    const defaultFg = theme === 'obsidian' ? '#d4d4d4' : '#A9B7C6';
    const defaultBg = theme === 'obsidian' ? '#1e1e1e' : '#2B2B2B';
    const fg = adjustColorForBg(res.fg ?? defaultFg, lightBg) ?? defaultFg;
    return res.tokens.map((line) => ({
      tokens: line.map((t) => ({
        content: t.content,
        offset: t.offset,
        color: adjustColorForBg(t.color ?? res.fg, lightBg) ?? fg,
      })),
      fg,
      bg: res.bg ?? defaultBg,
    }));
  } catch (e) {
    console.error('[shiki] highlightTokens 失败：', lang, e);
    return null;
  }
}

// ---- 主题切换 API（供设置面板调用）----
export function getHtmlTheme(): CodeTheme { return htmlTheme; }
export function getCodeTheme(): CodeTheme { return codeTheme; }

export function setHtmlTheme(t: CodeTheme): void {
  if (t === htmlTheme) return;
  htmlTheme = t;
  localStorage.setItem(HTML_THEME_KEY, t);
  themeChangeListeners.forEach((fn) => fn());
}

export function setCodeTheme(t: CodeTheme): void {
  if (t === codeTheme) return;
  codeTheme = t;
  localStorage.setItem(CODE_THEME_KEY, t);
  themeChangeListeners.forEach((fn) => fn());
}

// 注册主题变更回调（live-preview 用于清缓存 + 重新着色）
export function onCodeThemeChange(fn: () => void): () => void {
  themeChangeListeners.add(fn);
  return () => themeChangeListeners.delete(fn);
}

// 手动触发重新着色（代码块背景切换时调用，复用主题变更回调机制）
export function triggerRehighlight(): void {
  themeChangeListeners.forEach((fn) => fn());
}
