// 原始 HTML 渲染 Widget（FR-2 CommonMark 内嵌 HTML；块级/行内共用）
// HorizontalRule：分割线 `---`/`***`/`___` 渲染为 <hr>
import { WidgetType } from '@codemirror/view';

// 危险标签：成对或自闭合均移除（script 执行代码、iframe/embed/object 加载外部资源、meta/base/link/style 篡改文档）
const DANGEROUS_TAG_RE = /<\/?(script|iframe|object|embed|meta|base|link|style)\b[^>]*\/?>/gi;

// HTML 消毒：移除危险标签与事件属性、javascript:/data: 协议，防 XSS（打开不可信 .md 文件时尤为重要）
// 用正则而非 DOMParser：行内 HTML 经 markdown-it 拆成单标签（<mark> / </mark> 分别处理），
// DOMParser 会把 <mark> 自动闭合为 <mark></mark> 破坏配对；正则保留原片段结构，且无需 DOM 环境。
export function sanitizeHtml(html: string): string {
  // 循环移除危险标签，防嵌套混淆（如 <scr<script>ipt> 单次替换后会重组为 <script>）
  let out = html;
  let prev: string;
  do {
    prev = out;
    out = out.replace(DANGEROUS_TAG_RE, '');
  } while (out !== prev);
  // 移除 on* 事件属性（分隔符含空格/斜杠：onerror="..." / <img/onerror=...> / onload=foo）
  out = out.replace(/[\s\/]on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // href/src 的 javascript: / data: 协议 → 替换为 # 占位
  out = out.replace(/((?:href|src)\s*=\s*)("(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*')/gi, '$1"#"');
  return out;
}

export class HtmlWidget extends WidgetType {
  constructor(readonly html: string) { super(); }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.innerHTML = sanitizeHtml(this.html);
    return el;
  }
  eq(o: WidgetType): boolean {
    return o instanceof HtmlWidget && o.html === this.html;
  }
  ignoreEvent(): boolean { return true; }
}
