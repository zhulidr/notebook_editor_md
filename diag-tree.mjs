import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { EditorState, EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

function snapshot(doc, pos) {
  const s = EditorState.create({ doc, selection: EditorSelection.cursor(pos), extensions: [markdown({ extensions: [GFM] })] });
  const out = [];
  syntaxTree(s).iterate({ enter(n) { out.push(n.name + ':' + n.from + '-' + n.to); } });
  return out.join(' | ');
}

// 模拟逐键输入加粗，观察每一步 Emphasis/StrongEmphasis 出现及区间
let doc = '', pos = 0;
const bold = ['*','*','加','粗','*','*',' '];
for (const ch of bold) {
  doc = doc.slice(0, pos) + ch + doc.slice(pos);
  pos += ch.length;
  console.log('[' + ch + '] doc=' + JSON.stringify(doc) + ' cursor=' + pos + ' => ' + snapshot(doc, pos));
}
console.log('--- 标题 ---');
doc = ''; pos = 0;
const head = ['#',' ','标','题',' '];
for (const ch of head) {
  doc = doc.slice(0, pos) + ch + doc.slice(pos);
  pos += ch.length;
  console.log('[' + ch + '] doc=' + JSON.stringify(doc) + ' cursor=' + pos + ' => ' + snapshot(doc, pos));
}
