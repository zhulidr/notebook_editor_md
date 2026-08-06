# md-editor

混合模式（Live Preview）Markdown 编辑器，M1 + M2 浏览器版本。

## 功能（对应 REQUIREMENTS.md）

- FR-1 Live Preview：光标所在行为源码态，离开即渲染
- FR-2 GFM 基本语法（标题/列表/引用/链接/分割线/删除线）
- FR-3 数学公式：行内 `$…$`、块级 `$$…$$`（KaTeX，渲染缓存）
- FR-4 代码块：Shiki 高亮 + 自定义 IDEA Darcula 主题、语言标签、复制按钮
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

> 文件读写使用浏览器 File System Access API（Chrome/Edge 推荐）。
> 不支持的浏览器（如 Firefox）可打开文件但无法直接写盘，用"另存为"下载。

## 与架构文档的偏差

- ARCHITECTURE.md §3 用 `StateField` 描述 Live Preview；实现改用 `ViewPlugin.fromClass`，
  因为任务列表勾选（FR-6.4）需要在 Widget 内 dispatch 事务，需要 EditorView 引用，
  ViewPlugin 比 StateField 更易拿到 view。机制（活跃行判定 + Decoration.replace/mark）一致。
- 公式语法未被 @lezer/markdown 原生解析，故 `$$…$$` 与 `$…$` 在 `live-preview.ts` 中
  以文本扫描方式定位（跳过代码块/表格/已替换块），KaTeX 渲染结果按源码 hash 缓存（FR-3.5）。
- Tauri 外壳（M3）尚未接入；`src/platform/tauri-fs.ts` 为占位，M3 引入 `@tauri-apps/plugin-*` 后实现。
