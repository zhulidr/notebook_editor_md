// 原始 HTML 渲染 Widget（FR-2 CommonMark 内嵌 HTML；块级/行内共用）
//
// 这里不能把 Markdown 中的 HTML 直接交给 innerHTML。笔记文件是外部输入，
// 因此只保留一个小而明确的格式化标签/属性白名单。使用 DOMParser 可正确处理
// 无引号属性、实体编码和畸形嵌套，这些场景用正则很容易被绕过。
import { WidgetType } from '@codemirror/view';

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'hr',
  'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span',
  'strong', 'sub', 'summary', 'sup', 'u', 'ul', 'wbr',
]);

// 这些元素即使只“解包”其子节点也不安全或没有语义，直接删除整个子树。
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'meta', 'base', 'link',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math',
  'template', 'audio', 'video', 'source', 'track', 'canvas',
]);

const GLOBAL_ATTRIBUTES = new Set(['class', 'id', 'title', 'role', 'aria-label', 'aria-description']);
const SAFE_STYLE_PROPERTIES = [
  'color', 'background-color', 'font-weight', 'font-style', 'font-size',
  'font-family', 'text-decoration', 'text-align', 'vertical-align',
] as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizedUrl(value: string): string {
  // 浏览器会先把实体解码到 attribute.value；再去除空白/控制符，防止
  // `java\nscript:` 一类协议混淆。
  return value.trim().replace(/[\u0000-\u0020\u007f]+/g, '');
}

function isSafeUrl(value: string, image = false): boolean {
  const url = normalizedUrl(value);
  if (!url) return true;
  if (!image && url.startsWith('#')) return true;
  if (/^https?:/i.test(url)) return true;
  if (!image && /^(mailto|tel):/i.test(url)) return true;
  // 没有 scheme 的相对路径可以交给浏览器解析；带任意未知 scheme 的拒绝。
  return !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

function sanitizeStyle(value: string): string {
  const probe = document.createElement('span');
  probe.style.cssText = value;
  const declarations: string[] = [];
  for (const property of SAFE_STYLE_PROPERTIES) {
    const cssValue = probe.style.getPropertyValue(property).trim();
    if (!cssValue) continue;
    // 即使浏览器接受了某些旧/厂商 CSS，也不允许借 style 引入外部内容或脚本。
    if (/(?:url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|data:)/i.test(cssValue)) continue;
    declarations.push(`${property}: ${cssValue}`);
  }
  return declarations.join('; ');
}

function isAllowedAttribute(tag: string, name: string): boolean {
  if (GLOBAL_ATTRIBUTES.has(name) || name === 'style') return true;
  if (tag === 'a') return name === 'href' || name === 'target' || name === 'rel';
  if (tag === 'img') return name === 'src' || name === 'alt' || name === 'width' || name === 'height';
  if (tag === 'details') return name === 'open';
  if (tag === 'ol') return name === 'start';
  if (tag === 'li') return name === 'value';
  return false;
}

function sanitizeElement(element: Element): void {
  const tag = element.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const children = Array.from(element.childNodes);
    element.replaceWith(...children);
    children.forEach(sanitizeNode);
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (
      name.startsWith('on')
      || name.includes(':')
      || !isAllowedAttribute(tag, name)
    ) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style') {
      const style = sanitizeStyle(attribute.value);
      if (style) element.setAttribute('style', style);
      else element.removeAttribute('style');
      continue;
    }

    if (name === 'href') {
      if (isSafeUrl(attribute.value)) element.setAttribute('href', normalizedUrl(attribute.value));
      else element.setAttribute('href', '#');
      continue;
    }

    if (name === 'src') {
      if (isSafeUrl(attribute.value, true)) element.setAttribute('src', normalizedUrl(attribute.value));
      else element.removeAttribute('src');
      continue;
    }

    if (name === 'target') {
      const target = attribute.value.toLowerCase();
      if (target !== '_blank' && target !== '_self') element.removeAttribute('target');
      else if (target === '_blank') element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  Array.from(element.childNodes).forEach(sanitizeNode);
}

function sanitizeNode(node: Node): void {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) sanitizeElement(node as Element);
}

function serializeOpeningTag(element: Element): string {
  const attrs = Array.from(element.attributes)
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');
  return `<${element.tagName.toLowerCase()}${attrs}>`;
}

// markdown-it 会把 <mark>x</mark> 拆成 `<mark>`、文本、`</mark>` 三个 token。
// 对单个安全 tag 使用 DOMParser 验证属性后重新序列化，避免 DOMParser 自动补上
// 闭合标签，导致导出结果变成 `<mark></mark>x`。
function sanitizeStandaloneTag(source: string): string | null {
  const close = source.match(/^<\s*\/\s*([a-z][a-z0-9-]*)\s*>$/i);
  if (close) return ALLOWED_TAGS.has(close[1].toLowerCase()) ? `</${close[1].toLowerCase()}>` : '';

  if (!/^<\s*[a-z][a-z0-9-]*(?:\s|\/|>)/i.test(source)) return null;
  const inside = source.slice(1, -1);
  // 单标签 token 中不应包含另一个 < 或 >；遇到畸形片段改走完整 sanitizer。
  if (inside.includes('<') || inside.includes('>')) return null;
  const doc = new DOMParser().parseFromString(source, 'text/html');
  if (doc.body.childNodes.length !== 1 || !doc.body.firstElementChild) return null;
  sanitizeElement(doc.body.firstElementChild);
  const element = doc.body.firstElementChild;
  return element && ALLOWED_TAGS.has(element.tagName.toLowerCase()) ? serializeOpeningTag(element) : '';
}

// HTML 消毒：保留安全的文本格式，同时防 XSS。若运行环境没有 DOMParser，宁可显示
// 转义后的源码，也不退化为不安全的正则过滤。
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return escapeHtml(html);
  const source = html.trim();
  const standalone = sanitizeStandaloneTag(source);
  if (standalone !== null) return standalone;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.body.childNodes).forEach(sanitizeNode);
  return doc.body.innerHTML;
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
