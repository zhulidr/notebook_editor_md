// GFM 语言支持（ARCHITECTURE.md §2，需求 FR-2：表格/删除线/任务列表/自动链接）
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

export function markdownLang() {
  return markdown({ extensions: [GFM] });
}
