// Dataview 查询 Widget：```dataview 块渲染为结果表/列表（用户需求：支持 dataview）
// 说明：Obsidian 的 dataview 基于 vault 全库笔记；本编辑器为单文档，故查询范围 = 当前文档，
// 支持常见 DQL 子集：TABLE / LIST / TASK + FROM + WHERE + SORT。无法查询其他笔记。
import { WidgetType, type EditorView } from '@codemirror/view';

interface Task { text: string; done: boolean; heading: string; }
interface Heading { level: number; text: string; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 解析 YAML frontmatter → 字段表
function parseFrontmatter(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const m = src.match(/^---\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([^:#][\w\-.]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const val = kv[2].trim().replace(/^["']|["']$/g, '');
    if (!out[key]) out[key] = [];
    out[key].push(val);
  }
  return out;
}

function collectTasks(src: string, headings: Heading[]): Task[] {
  const out: Task[] = [];
  const lines = src.split(/\r?\n/);
  let curHeading = '';
  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { curHeading = hm[2].trim(); continue; }
    const tm = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (tm) out.push({ text: tm[2], done: tm[1].toLowerCase() === 'x', heading: curHeading });
  }
  return out;
}

interface Row { [k: string]: string; }

export class DataviewWidget extends WidgetType {
  constructor(
    readonly query: string,
    readonly from: number,
  ) { super(); }

  toDOM(view: EditorView): HTMLElement {
    const widget = this;
    const wrap = document.createElement('div');
    wrap.className = 'md-dataview';
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: widget.from } });
      view.focus();
    });

    const src = view.state.doc.toString();
    const fm = parseFrontmatter(src);
    const headings: Heading[] = [];
    for (const line of src.split(/\r?\n/)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) headings.push({ level: m[1].length, text: m[2].trim() });
    }
    const tasks = collectTasks(src, headings);
    const tags = Array.from(new Set(
      (src.match(/#([\w\u4e00-\u9fa5\-/]+)/g) || []).map((t) => t.slice(1)),
    ));

    // 把当前文档虚拟为一个笔记条目（dataview 的 file 对象最小子集）
    const fileRow: Row = {
      'file.name': document.title || '当前文档',
      'file.folder': '/',
      'file.tags': tags.join(', '),
      'file.tasks': String(tasks.length),
      'file.lists': String(tasks.length),
      ...Object.fromEntries(Object.entries(fm).map(([k, v]) => [`${k}`, v.join(', ')])),
    };

    const rows: Row[] = [fileRow];
    // FROM #tag / "file" / 空：把当前文档纳入
    const q = this.query.trim();

    // WHERE 条件求值（支持字段 == / != / contains）
    function where(row: Row, expr: string): boolean {
      const e = expr.trim().replace(/^WHERE\s+/i, '');
      const m = e.match(/^([\w.\-]+)\s*(==|!=|contains)\s*(.+)$/);
      if (!m) return true;
      const [, field, op, rawVal] = m;
      const val = (row[field.toLowerCase()] ?? '').toLowerCase();
      const want = rawVal.replace(/^["']|["']$/g, '').toLowerCase();
      if (op === '==') return val === want;
      if (op === '!=') return val !== want;
      if (op === 'contains') return val.includes(want);
      return true;
    }
    const whereM = q.match(/WHERE\s+(.+)$/i);
    const filtered = rows.filter((r) => where(r, whereM ? whereM[1] : ''));

    // SORT field ASC/DESC（对单文档意义有限，保留语法）
    const sortM = q.match(/SORT\s+([\w.\-]+)\s*(ASC|DESC)?/i);
    if (sortM) {
      const key = sortM[1].toLowerCase();
      const dir = (sortM[2] || 'ASC').toUpperCase() === 'ASC' ? 1 : -1;
      filtered.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * dir);
    }

    // 类型：TABLE / LIST / TASK
    const isTask = /^TASK/i.test(q);
    const isList = /^LIST/i.test(q);
    const isTable = /^TABLE/i.test(q);

    const h = document.createElement('div');
    h.className = 'md-dataview-title';
    h.textContent = isTask ? '任务列表' : isList ? '列表' : isTable ? '查询结果' : '查询结果';

    if (isTask) {
      const ul = document.createElement('ul');
      ul.className = 'md-dataview-tasks';
      for (const t of tasks) {
        const li = document.createElement('li');
        li.className = 'md-dataview-task' + (t.done ? ' done' : '');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = t.done;
        box.disabled = true;
        const label = document.createElement('span');
        label.textContent = t.text + (t.heading ? ` （${t.heading}）` : '');
        li.append(box, label);
        ul.appendChild(li);
      }
      if (tasks.length === 0) h.textContent = '（无任务）';
      wrap.append(h, ul);
      return wrap;
    }

    if (isTable) {
      // TABLE 字段：取显式列
      const tableM = q.match(/^TABLE\s+([^\n]+)/i);
      const cols = tableM && tableM[1].trim() !== ''
        ? tableM[1].split(',').map((c) => c.trim())
        : Object.keys(fm).length ? Object.keys(fm) : ['file.name', 'file.tags'];
      const table = document.createElement('table');
      table.className = 'md-table';
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const c of cols) {
        const th = document.createElement('th');
        th.textContent = c;
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      if (filtered.length === 0) {
        const tr2 = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = cols.length;
        td.textContent = '（当前文档无匹配数据）';
        tr2.appendChild(td);
        tbody.appendChild(tr2);
      }
      for (const row of filtered) {
        const tr2 = document.createElement('tr');
        for (const c of cols) {
          const td = document.createElement('td');
          const v = row[c.toLowerCase()] ?? row[c] ?? '';
          td.textContent = Array.isArray(v) ? v.join(', ') : String(v);
          tr2.appendChild(td);
        }
        tbody.appendChild(tr2);
      }
      table.appendChild(tbody);
      wrap.append(h, table);
      return wrap;
    }

    // LIST
    const ul = document.createElement('ul');
    ul.className = 'md-dataview-list';
    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.textContent = '（当前文档无匹配数据）';
      ul.appendChild(li);
    }
    for (const row of filtered) {
      const li = document.createElement('li');
      li.textContent = Object.values(row).filter(Boolean).join(' · ');
      ul.appendChild(li);
    }
    wrap.append(h, ul);
    return wrap;
  }

  eq(o: WidgetType): boolean {
    return o instanceof DataviewWidget && o.query === this.query && o.from === this.from;
  }
  ignoreEvent(): boolean { return true; }
}

export { esc as dataviewEsc };
