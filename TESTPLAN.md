# 测试计划（TESTPLAN）

覆盖 Markdown 编辑器核心逻辑的单元测试。环境：vitest + jsdom。

## 1. Live Preview 核心装饰逻辑（`editor/cm/live-preview.test.ts`）

通过 `build(EditorState)` 产出 `DecorationSet`，用 `between()` 提取装饰断言。

| 用例 | 输入 | 期望 |
|---|---|---|
| activeLines-单行 | `# t`，光标在行1 | 标题不渲染（无装饰） |
| activeLines-离开 | `# t\n\nx`，光标在行3 | 标题行有 hide-`#` replace + md-h1 mark |
| 标题级别 | `## t\n\nx` 光标行3 | md-h2 mark |
| 围栏代码-渲染 | ` ```js\ncode\n``` `\n\nx，光标行末 | block replace 装饰，widget=CodeBlockWidget，block=true |
| **围栏代码-range 不吃额外行** | 同上 | 装饰 to == 代码块闭合行之后第一个行首（不包含后续空行） |
| 围栏代码-活跃 | 光标在代码块内 | 无代码块装饰（显示源码） |
| 缩进代码块 | 4空格缩进代码 | block replace，widget=CodeBlockWidget |
| 表格 | GFM 表格 | block replace，widget=TableWidget |
| 块公式-行首 | `$$\nx\n$$` 独立行 | block replace，widget=BlockMathWidget |
| 块公式-内联 | `a $$x$$ b` | inline replace（非 block） |
| 行内公式 | `a $x$ b` | inline replace，widget=InlineMathWidget |
| 行内公式-活跃 | 光标在 `$x$` 行 | 无装饰 |
| 图片 | `![alt](url)` | replace，widget=ImageWidget |
| 任务标记 | `- [ ] t` | replace，widget=CheckboxWidget |
| 加粗 | `**b**` 光标离开 | hide 标记 replace + md-bold mark |
| 斜体/删除线/行内代码 | 类似 | 对应 mark class |
| blockEnd-行首不扩展 | to 在行首 | 返回 to 本身 |

## 2. 表格 Widget（`editor/widgets/table.test.ts`）

| 用例 | 输入 | 期望 |
|---|---|---|
| 基本渲染 | `\| a \| b \|\n\|---\|---\|\n\| 1 \| 2 \|` | 2行（thead+tbody），表头加粗 |
| 对齐 | `:--` / `:-:` / `--:` | 左/中/右 textAlign |
| 单元格行内公式 | `$x$` | 含 katex HTML |

## 3. 渲染管线（`render/pipeline.test.ts`）

| 用例 | 输入 | 期望 |
|---|---|---|
| 行内公式 | `a $x^2$ b` | 含 katex HTML，无 `$` |
| 块公式 | `$$\int x dx$$` | 含 katex display HTML |
| 公式不破坏markdown | `**b** $x$` | 加粗 + 公式均生效 |
| exportHtml | 任意 | 含 `<html>` 与 katex CSS link |

## 4. 平台层（`platform/*.test.ts`）

| 用例 | 期望 |
|---|---|
| web-fs.getName | 从句柄名返回 |
| tauri-fs.getName | 从路径取 basename |

## 5. 数学缓存（`editor/widgets/math.test.ts`）

| 用例 | 期望 |
|---|---|
| 相同 tex 只渲染一次 | KaTeX 调用计数=1（通过缓存） |

## 修复循环

每轮：`npx vitest run` → 看失败 → 修代码/测试 → 重复，直到全绿或 7:40。
