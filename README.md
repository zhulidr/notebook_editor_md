# notebook_editor_md

自用 Markdown 编辑器

## 功能

- FR-1 Live Preview：光标所在行为源码态，离开即渲染
- FR-2 GFM 基本语法（标题/列表/引用/链接/分割线/删除线）
- FR-3 数学公式：行内 `$…$`、块级 `$$…$$`（KaTeX，渲染缓存）
- FR-4 代码块：Shiki 高亮 + 自定义 IDEA Darcula / Obsidian 主题、语言标签、复制按钮
- FR-5 表格：GFM 管道表格，支持对齐语法
- FR-6 图片 / 任务列表（可点勾选回写源码）
- FR-7 文件管理：新建/打开/保存/另存为、500ms 防抖自动保存、脏标记、最近文件
- FR-8 撤销重做、Ctrl+B/I/K 快捷键
- FR-9 导出单文件 HTML

## 运行

```bash
npm install
npm run dev      # 浏览器打开 http://localhost:5173
npm run build    # 类型检查 + 打包到 dist/
```

桌面版（Tauri）：

```bash
cd src-tauri
cargo build           # 调试构建
tauri build --debug --no-bundle  # 嵌入 dist 的调试 exe
```

## 技术栈

- **前端**：React + TypeScript + Vite + CodeMirror 6
- **桌面**：Tauri 2 (Rust)
- **高亮**：Shiki（IDEA Darcula / Obsidian 主题）
- **渲染**：KaTeX 公式、Mermaid 图表、GFM 表格/任务列表
