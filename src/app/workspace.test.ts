import { describe, expect, it } from 'vitest';
import { relativeWorkspacePath } from './workspace';

describe('workspace relative path', () => {
  it('处理 Windows 路径且不区分盘符大小写', () => {
    expect(relativeWorkspacePath('D:\\Notes', 'd:\\Notes\\docs\\roadmap.md')).toBe('docs/roadmap.md');
  });

  it('处理 Web File System Access 虚拟路径', () => {
    expect(relativeWorkspacePath('1:Notebook', '1:Notebook/docs/guide.md')).toBe('docs/guide.md');
  });

  it('仓库之外的路径安全退化为文件名', () => {
    expect(relativeWorkspacePath('/notes', '/other/readme.md')).toBe('readme.md');
  });
});
