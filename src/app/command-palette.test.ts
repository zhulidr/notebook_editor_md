import { describe, expect, it } from 'vitest';
import { fuzzyScore } from './command-palette';

describe('command palette fuzzy search', () => {
  it('完整前缀优先于普通包含', () => {
    expect(fuzzyScore('open', 'Open workspace')).toBeGreaterThan(fuzzyScore('open', 'Quick open file'));
  });

  it('支持中文命令片段', () => {
    expect(fuzzyScore('分屏', '向右分屏')).toBeGreaterThan(0);
    expect(fuzzyScore('表格', '插入代码块')).toBe(-1);
  });

  it('支持按顺序输入的缩写', () => {
    expect(fuzzyScore('qof', 'Quick open file')).toBeGreaterThan(0);
  });

  it('忽略路径分隔符和大小写', () => {
    expect(fuzzyScore('docs road', 'DOCS/roadmap.md')).toBeGreaterThan(0);
  });
});
