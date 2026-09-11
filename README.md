# Notebook Editor MD

Notebook Editor MD is a lightweight, open-source, local-first Markdown editor built with CodeMirror 6 and Tauri. Its defining experiment is an inline/live Markdown preview: the line being edited remains readable Markdown source, while inactive lines are rendered in the same editor surface.

The project keeps documents as ordinary Markdown files and is intended to be useful both as a focused writing tool and as a reference implementation for building a CodeMirror 6 + Tauri Markdown editor.

## Why this project?

Split-pane editors separate writing from preview. Notebook Editor MD explores a different interaction model: Markdown stays close to the text while the rendered result appears in place. The codebase is deliberately approachable for developers who want to study how CodeMirror 6 decorations, Markdown syntax analysis, rendering widgets, and a Tauri file-system layer fit together.

This repository makes no claims about stars, downloads, users, issues, pull requests, or ecosystem adoption. It is an early-stage open-source project.

## Features

The following capabilities are implemented in the current source tree:

- **Inline/live preview** powered by CodeMirror 6 decorations. The active line stays in source mode; supported inactive Markdown is rendered inline.
- **GFM-oriented Markdown support** through CodeMirror's Lezer Markdown parser, including headings, emphasis, strikethrough, blockquotes, lists, links, task lists, tables, inline code, and horizontal rules.
- **KaTeX mathematics**, with inline `$...$` and block `$$...$$` rendering and a small render cache.
- **Mermaid diagrams** from `mermaid` fenced code blocks.
- **Shiki syntax highlighting** for fenced and indented code blocks, with IDEA Darcula and Obsidian-inspired themes, language labels, and copy controls.
- **Images, HTML, callouts, and tables** rendered through editor widgets. Task-list checkboxes can write their state back to the Markdown source.
- **Local file workflows** for new, open, save, save as, debounced automatic save, dirty-state tracking, tabs, recent files, and outline navigation.
- **HTML export** and a print-dialog flow for PDF output.
- **Browser and desktop file access**: the browser build uses the File System Access API where available; the Tauri build provides native file dialogs and file commands.

The editor also contains current experiments for Obsidian-style callouts, `dataview` blocks scoped to the current document, and `.canvas` files. These are implementation details of the present codebase, not a promise of full compatibility with another application's format or plugin ecosystem.

## Technology

- [CodeMirror 6](https://codemirror.net/) and [Lezer Markdown](https://github.com/lezer-parser/markdown) for editing and syntax analysis
- [Tauri 2](https://tauri.app/) and Rust for the native desktop shell
- [markdown-it](https://github.com/markdown-it/markdown-it) for export rendering
- [KaTeX](https://katex.org/) for mathematics
- [Mermaid](https://mermaid.js.org/) for diagrams
- [Shiki](https://shiki.style/) for code highlighting
- TypeScript and Vite for the web application

## Screenshots

No product screenshots or demo recordings are checked into this repository yet. The image files currently present are application/icon assets, so they are intentionally not presented as UI screenshots.

## Development

### Requirements

For the web application:

- Node.js and npm

For the Tauri desktop application:

- A Rust toolchain
- The platform prerequisites listed in the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
git clone https://github.com/zhulidr/notebook_editor_md.git
cd notebook_editor_md
npm ci
```

### Run the web version

```bash
npm run dev
```

The Vite development server uses `http://localhost:5173`. Opening and saving files in the browser requires a browser with the File System Access API, such as a current Chrome or Edge release; the application reports a limitation when that API is unavailable.

### Run the Tauri version

```bash
npm run tauri -- dev
```

### Build

Build the web application:

```bash
npm run build
```

Build the desktop application through Tauri:

```bash
npm run tauri -- build
```

The repository's `package.json` currently defines these npm scripts: `dev`, `build`, `preview`, and `tauri`. There is no `npm test` script yet.

## Testing

Vitest test files are present under `src/**/*.test.ts`, and the repository includes `vitest.config.ts`. Run them directly with the installed dev dependency:

```bash
npx vitest run
```

The current CI workflow uses the same command because `package.json` does not define a `test` script. `npm run build` is the TypeScript check plus Vite production build.

`TESTPLAN.md` describes additional intended coverage. It should be read as a test plan, not as evidence that every listed test exists or passes today.

## Project status and v0.1.0 readiness

The JavaScript package, Tauri configuration, and Rust crate metadata currently contain version `0.1.0`. That metadata is not, by itself, a published release: this repository has no release/tag created as part of this documentation change.

The following items still need attention before calling `v0.1.0` release-ready:

- Make the full Vitest run green. In this checkout, `npx vitest run` currently fails during test collection because `localStorage` is not defined in the configured Node test environment, and one table-widget test expects a `TABLE` root while the implementation returns a wrapping `DIV`.
- Decide whether to add an npm `test` script and align `vitest.config.ts` with the browser-facing tests; the current CI intentionally invokes Vitest directly and does not hide the failure.
- Add or complete tests for the platform file-system layer, math cache, and other cases listed in `TESTPLAN.md`, where those cases are still missing from the tree.
- Perform desktop smoke tests and platform packaging checks for the intended release targets. This audit verified the web build, not a native Tauri bundle.
- Document supported operating systems, installation/distribution steps, known limitations, and a release checklist after those checks are complete.
- Add a real product screenshot or demo only when one is available; none is currently present in the repository.

Until the test and desktop validation items are resolved, this project is better described as an early-stage `0.1.0` codebase than as a confirmed `v0.1.0` release.

## Roadmap

Planned areas of development include:

- [ ] Stable Windows release and documented desktop installation
- [ ] macOS and Linux packaging
- [ ] Broader Markdown compatibility and improved image handling
- [ ] Drag-and-drop files and images
- [ ] Search and replace improvements
- [ ] Configurable editor themes and accessibility workflows
- [ ] Performance improvements for large Markdown files
- [ ] More comprehensive automated tests and release automation
- [ ] Exploration of plugin or other extensibility mechanisms

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, issue and pull-request guidance, test commands, and commit suggestions.

Bug reports and feature discussion are welcome through GitHub Issues. For larger changes, please open an issue before implementation so the direction can be discussed.

## Maintainer

Notebook Editor MD is currently maintained by [@zhulidr](https://github.com/zhulidr). Maintenance includes feature development, bug fixing, test coverage, releases, issue triage, and reviewing community contributions.

## License

The repository is licensed under the [Apache License 2.0](LICENSE). See the license text for the complete terms, permissions, conditions, and disclaimers.
