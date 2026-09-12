export type IconName =
  | 'file-plus'
  | 'folder-open'
  | 'save'
  | 'save-as'
  | 'export'
  | 'print'
  | 'outline'
  | 'theme'
  | 'settings'
  | 'split-right'
  | 'split-down'
  | 'search'
  | 'file'
  | 'command'
  | 'table'
  | 'code'
  | 'link'
  | 'x'
  | 'chevron';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function createIcon(name: IconName, className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  use.setAttributeNS(XLINK_NS, 'xlink:href', `#icon-${name}`);
  svg.appendChild(use);
  return svg;
}
