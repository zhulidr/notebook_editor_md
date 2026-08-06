import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';

const doc = '# Hello\n\n**bold** and *ital*\n\n```python\nprint(1)\n```\n\n- [ ] task\n';
const state = EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
const tree = syntaxTree(state);
console.log('tree length:', tree.length, 'doc length:', doc.length);
const names = [];
tree.iterate({ enter(node) { names.push(`${node.name}@${node.from}-${node.to}`); } });
console.log(names.join('\n'));
