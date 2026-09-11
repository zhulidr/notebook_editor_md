# Contributing to Notebook Editor MD

Thanks for helping improve Notebook Editor MD. The project is an early-stage open-source CodeMirror 6 + Tauri Markdown editor, so focused bug reports, compatibility testing, documentation, and small implementation improvements are all useful.

## Development environment

Web development requires Node.js and npm. Desktop development also requires Rust and the native prerequisites for Tauri 2; see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/zhulidr/notebook_editor_md.git
cd notebook_editor_md
npm ci
```

Useful commands from the current `package.json` are:

```bash
npm run dev             # Vite development server
npm run build           # TypeScript check and production web build
npm run preview         # Preview the production web build
npm run tauri -- dev    # Tauri development application
npm run tauri -- build  # Tauri desktop build
npx vitest run          # Run the existing Vitest files directly
```

There is currently no `test`, lint, or format npm script. Do not assume that a green `npm run build` means the test suite is green; run `npx vitest run` separately and report any failure accurately.

## Issues

Before opening an issue, search existing issues for duplicates. A useful bug report includes:

- operating system and whether the web or Tauri build was used;
- the exact steps and a minimal Markdown document that reproduces the problem;
- expected behavior and actual behavior;
- the relevant browser/runtime version and console or application error, with secrets removed.

For feature requests, explain the Markdown syntax or editing workflow, the desired behavior, and any compatibility or data-preservation constraints. For larger changes, open an issue before implementation so the direction can be discussed.

## Pull requests

Keep pull requests narrow and describe the user-visible behavior they change. A pull request should include:

1. a concise summary and the motivation;
2. the validation commands that were run and their results;
3. test changes for behavior changes where practical;
4. screenshots or a short recording for UI changes, when available;
5. notes about platform-specific behavior, file formats, or compatibility risks.

Do not include generated build output, local configuration, secrets, or unrelated formatting changes. Preserve standard Markdown files and avoid changing document contents as a side effect of editor behavior unless that behavior is the feature being changed.

## Tests and review checklist

At minimum, run:

```bash
npx vitest run
npm run build
```

For Tauri or file-system changes, also run the desktop app locally and exercise open, save, save as, and export flows on the affected platform. For Markdown rendering changes, check both the active-line source state and inactive-line preview state, including malformed or unsupported input where relevant.

The existing tests cover parts of live preview, tables, rendering, and regression behavior. `TESTPLAN.md` records broader intended coverage. If a test fails before your change, call that out in the pull request rather than weakening or skipping it without explanation.

## Code style

Follow the surrounding TypeScript and Rust style. In the existing TypeScript code this generally means two-space indentation, semicolons, single-quoted strings, explicit types at public boundaries, and small modules with comments where editor-state or platform behavior is non-obvious. Keep CodeMirror state logic separate from DOM widgets and keep platform-specific file operations behind the platform abstraction.

There is no repository-enforced formatter or linter at present, so review the diff manually and avoid broad reformatting. Keep user-facing strings consistent with the existing application language unless the change is specifically about localization.

## Commit suggestions

Use a short, imperative subject with an optional scope, for example:

```text
docs: clarify inline preview behavior
fix: preserve task-list markers on toggle
test: cover math export fallback
ci: run Vitest and the production build
```

Keep each commit focused. The examples above are suggestions, not an existing enforced commit policy.

## License

The repository is licensed under the [Apache License 2.0](LICENSE). Contributions intentionally submitted for inclusion are covered by the contribution terms in Section 5 of that license.
