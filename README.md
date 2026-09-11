# Notebook Editor MD

A lightweight, open-source, local-first Markdown editor with live inline preview, built with CodeMirror 6 and Tauri.

Notebook Editor MD is designed to provide a focused Markdown writing experience where the line currently being edited remains as Markdown source, while inactive lines are rendered immediately.

Unlike traditional split-pane Markdown editors, the goal is to keep writing and previewing in the same document surface.

> Early-stage project — actively developed and open to feedback, issues, and contributions.

## Why Notebook Editor MD?

Many Markdown editors either use a separate preview panel or hide most Markdown syntax completely.

Notebook Editor MD explores a different editing model:

- Keep the active line editable as raw Markdown.
- Render inactive content directly inside the editor.
- Keep documents as standard `.md` files.
- Work locally without requiring a cloud account or proprietary storage format.
- Provide a native desktop experience through Tauri.

The project aims to provide a small, hackable open-source foundation for experimenting with modern Markdown editing experiences based on CodeMirror 6.

## Features

### Live Markdown Preview

The line containing the cursor stays in source mode. When the cursor leaves the line, supported Markdown elements are rendered directly inside the editor.

Supported syntax includes:

- Headings
- Bold and italic text
- Strikethrough
- Blockquotes
- Ordered and unordered lists
- Links
- Horizontal rules
- Inline code
- GFM tables
- Task lists

### Mathematics

Supports KaTeX rendering for:

- Inline math: `$x^2$`
- Block math: `$$...$$`

Math rendering is cached to reduce unnecessary rerendering.

### Code Blocks

Fenced and indented code blocks are rendered with Shiki syntax highlighting.

Features include:

- Language labels
- Copy button
- IDEA Darcula inspired theme
- Obsidian inspired theme

### Mermaid Diagrams

Markdown documents can contain Mermaid diagrams for flowcharts and other diagrams.

### Images and Task Lists

Supports Markdown images and interactive GFM task lists.

Task-list checkboxes can update the original Markdown source when toggled.

### File Management

Desktop functionality includes:

- New file
- Open file
- Save
- Save As
- Automatic save with debounce
- Dirty-state tracking
- Recent files

### Editing

Common editing operations are supported, including:

- Undo / Redo
- `Ctrl+B` — Bold
- `Ctrl+I` — Italic
- `Ctrl+K` — Link

### HTML Export

Documents can be exported as standalone HTML for sharing or publishing outside the editor.

## Screenshots

> Screenshots and demo recordings are being prepared.

Add screenshots here, for example:

```text
docs/screenshots/editor.png
docs/screenshots/math.png
docs/screenshots/code-block.png
```

A short GIF or video demonstrating the live-preview editing model is especially useful.

## Technology

Notebook Editor MD is built with:

- **CodeMirror 6** — editor infrastructure
- **TypeScript**
- **Vite**
- **Tauri 2 / Rust** — native desktop application
- **markdown-it** — Markdown rendering
- **KaTeX** — mathematical expressions
- **Mermaid** — diagrams
- **Shiki** — syntax highlighting
- **Lezer Markdown** — Markdown syntax analysis

## Development

### Requirements

For web development:

- Node.js
- npm

For the desktop application:

- Rust toolchain
- Tauri 2 development dependencies

### Install

```bash
git clone https://github.com/zhulidr/notebook_editor_md.git
cd notebook_editor_md
npm install
```

### Run the Web Version

```bash
npm run dev
```

The development server runs at:

```text
http://localhost:5173
```

### Build

```bash
npm run build
```

### Build the Desktop Version

```bash
npm run build
cd src-tauri
cargo build
```

For a Tauri debug build:

```bash
tauri build --debug --no-bundle
```

## Testing

The project contains tests for important parts of the Markdown editing and rendering pipeline, including:

- Live-preview decorations
- Markdown tables
- Math rendering
- Rendering pipeline
- Platform filesystem abstraction
- Math rendering cache

Run tests with:

```bash
npx vitest run
```

See [TESTPLAN.md](TESTPLAN.md) for the current testing strategy.

## Project Status

Notebook Editor MD is currently in early development.

Current priorities include:

- improving Markdown compatibility
- improving editor performance on large documents
- expanding automated tests
- improving desktop packaging
- improving accessibility and keyboard workflows
- supporting more operating systems
- improving documentation
- gathering feedback from real users

## Roadmap

Planned areas of development include:

- [ ] Stable Windows release
- [ ] macOS and Linux packaging
- [ ] Improved image handling
- [ ] Drag-and-drop files and images
- [ ] Search and replace improvements
- [ ] Configurable editor themes
- [ ] Performance optimization for large Markdown files
- [ ] More comprehensive automated tests
- [ ] CI builds and automated releases
- [ ] Plugin/extensibility exploration

Suggestions are welcome through GitHub Issues.

## Contributing

Contributions are welcome.

You can help by:

- reporting bugs
- proposing features
- improving documentation
- testing the editor on different operating systems
- improving Markdown compatibility
- submitting pull requests

For larger changes, please open an issue first so the implementation can be discussed.

## Open Source

Notebook Editor MD is intended to remain an open-source project and use standard Markdown files rather than a proprietary document format.

The goal is to create a useful Markdown editor while also providing an accessible CodeMirror 6 + Tauri reference implementation for developers interested in building modern Markdown editing experiences.

## Maintainer

Notebook Editor MD is currently primarily maintained by [@zhulidr](https://github.com/zhulidr).

Maintenance work includes feature development, bug fixing, test coverage, releases, issue triage, and reviewing community contributions.

## License

Licensed under the [Apache License 2.0](LICENSE).
