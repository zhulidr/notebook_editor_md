# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project currently uses Semantic Versioning as a release target. Dates and released versions are added only when a release is actually published.

## [Unreleased]

### Added

- Added contributor guidance covering development setup, issues, pull requests, tests, code style, and commit suggestions.
- Added a GitHub Actions workflow that installs the locked npm dependencies, runs the repository's existing Vitest files directly, and runs the existing production build script on pushes and pull requests.
- Added a keyboard-first `Ctrl+P` command palette with fuzzy command search, workspace file quick-open, and an always-visible insert-table action.
- Added two-pane editing with left/right and top/bottom layouts, resizable panes, independent cursor/scroll state, and synchronized edits when both panes show the same document.
- Added a tag-triggered GitHub Actions workflow that builds a Windows NSIS installer and uploads it to a draft GitHub Release.

### Changed

- Rewrote the README to describe the current open-source, local-first Markdown editor, its CodeMirror 6 + Tauri inline/live preview architecture, implemented Markdown features, development commands, screenshots status, license, and v0.1.0 readiness.
- Reworked the application shell around a compact toolbar, continuous outline sidebar, file tabs, split-pane headers, and a clearer status bar.

### Fixed

- Isolated CodeMirror preview and theme state per editor view so split panes do not share transient widget state or crash during nested updates.
- Treated cancelled browser file pickers as a normal no-selection result instead of an unhandled error.
- Kept the caret on the right side of a just-completed inline HTML element so typing can continue after the rendered span.

There is no dated `[0.1.0]` release entry yet. The `0.1.0` values in package and Tauri metadata should not be read as evidence that a release, tag, or distribution has been published.
