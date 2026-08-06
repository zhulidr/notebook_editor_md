// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { TableWidget, preserveMarkers } from './table';

const fakeView = { dispatch: () => {}, focus: () => {}, state: { doc: { length: 0 } } } as never;

describe('TableWidget', () => {
  it('基本表格：表头 + 一行', () => {
    const w = new TableWidget('| a | b |\n|---|---|\n| 1 | 2 |', 0, fakeView);
    const el = w.toDOM();
    expect(el.tagName).toBe('TABLE');
    expect(el.querySelectorAll('th').length).toBe(2);
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('th')!.textContent).toBe('a');
  });

  it('对齐语法映射', () => {
    const w = new TableWidget('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |', 0, fakeView);
    const el = w.toDOM();
    const ths = [...el.querySelectorAll('th')] as HTMLTableCellElement[];
    expect(ths[0].style.textAlign).toBe('left');
    expect(ths[1].style.textAlign).toBe('center');
    expect(ths[2].style.textAlign).toBe('right');
  });

  it('单元格内行内公式', () => {
    const w = new TableWidget('| x |\n|---|\n| $a^2$ |', 0, fakeView);
    const el = w.toDOM();
    expect(el.querySelector('td')!.innerHTML).toContain('katex');
  });
});

describe('preserveMarkers（Bug 4：表格编辑回写保留 Markdown 标记）', () => {
  it('原 **bold** 编辑后保留 ** 包裹', () => {
    expect(preserveMarkers('**bold**', 'italic')).toBe('**italic**');
  });
  it('原 *italic* 编辑后保留 * 包裹', () => {
    expect(preserveMarkers('*italic*', 'new')).toBe('*new*');
  });
  it('原 `code` 编辑后保留 ` 包裹', () => {
    expect(preserveMarkers('`code`', 'edited')).toBe('`edited`');
  });
  it('原 $math$ 编辑后保留 $ 包裹', () => {
    expect(preserveMarkers('$a^2$', 'b^2')).toBe('$b^2$');
  });
  it('原 ***斜粗体*** 编辑后保留 *** 包裹', () => {
    expect(preserveMarkers('***x***', 'y')).toBe('***y***');
  });
  it('原 ==高亮== 编辑后保留 == 包裹', () => {
    expect(preserveMarkers('==hl==', 'new')).toBe('==new==');
  });
  it('无标记纯文本 → 原样返回', () => {
    expect(preserveMarkers('hello', 'world')).toBe('world');
  });
});
