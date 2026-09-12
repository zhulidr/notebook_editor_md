import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { TableWidget, preserveMarkers } from './table';
import { livePreview, viewCapture } from '../cm/live-preview';

const fakeView = { dispatch: () => {}, focus: () => {}, state: { doc: { length: 0 } } } as never;

describe('TableWidget', () => {
  it('基本表格：表头 + 一行', () => {
    const w = new TableWidget('| a | b |\n|---|---|\n| 1 | 2 |', 0);
    const el = w.toDOM(fakeView);
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('md-table-wrapper');
    expect(el.querySelector('table')?.tagName).toBe('TABLE');
    expect(el.querySelector('.md-table-add-row')).not.toBeNull();
    expect(el.querySelector('.md-table-add-col')).not.toBeNull();
    expect(el.querySelectorAll('th').length).toBe(2);
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('th')!.textContent).toBe('a');
  });

  it('对齐语法映射', () => {
    const w = new TableWidget('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |', 0);
    const el = w.toDOM(fakeView);
    const ths = [...el.querySelectorAll('th')] as HTMLTableCellElement[];
    expect(ths[0].style.textAlign).toBe('left');
    expect(ths[1].style.textAlign).toBe('center');
    expect(ths[2].style.textAlign).toBe('right');
  });

  it('单元格内行内公式', () => {
    const w = new TableWidget('| x |\n|---|\n| $a^2$ |', 0);
    const el = w.toDOM(fakeView);
    expect(el.querySelector('td')!.innerHTML).toContain('katex');
  });

  it('转义竖线属于当前单元格，而不是额外列', () => {
    const w = new TableWidget('| a \\| b | c |\n| --- | --- |\n| 1 | 2 |', 0);
    const el = w.toDOM(fakeView);
    expect(el.querySelectorAll('th')).toHaveLength(2);
    expect(el.querySelectorAll('th')[0].textContent).toBe('a | b');
    expect(el.querySelectorAll('th')[1].textContent).toBe('c');
  });

  it('单元格内容始终按文本处理，不能注入 HTML 事件', () => {
    const w = new TableWidget('| <img src="x" onerror="window.__xss = true"> | ok |\n| --- | --- |', 0);
    const el = w.toDOM(fakeView);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('th')?.textContent).toContain('<img src="x"');
  });

  it('编辑后按 Tab 按行移动焦点，越过末列时创建下一行并进入首列', async () => {
    const doc = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [markdown({ extensions: [GFM] }), viewCapture, livePreview],
      }),
    });
    const cells = () => [...view.dom.querySelectorAll<HTMLElement>('.md-table th, .md-table td')]
      .filter((cell) => cell.contentEditable === 'true');
    const editAndTab = async (index: number, text: string) => {
      const cell = cells()[index];
      cell.focus();
      cell.innerText = text;
      cell.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', bubbles: true, cancelable: true,
      }));
      await Promise.resolve();
    };

    try {
      await editAndTab(0, '标题一');
      expect(view.state.doc.toString()).toContain('| 标题一 | 列2 | 列3 |');
      expect(document.activeElement).toBe(cells()[1]);
      expect(cells()[1].contains(document.getSelection()?.focusNode ?? null)).toBe(true);

      await editAndTab(1, '标题二');
      expect(document.activeElement).toBe(cells()[2]);

      await editAndTab(2, '标题三');
      expect(view.state.doc.toString()).toContain('\n|  |  |  |');
      expect(cells()).toHaveLength(6);
      expect(document.activeElement).toBe(cells()[3]);
      expect(cells()[3].contains(document.getSelection()?.focusNode ?? null)).toBe(true);
    } finally {
      view.destroy();
      parent.remove();
    }
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
