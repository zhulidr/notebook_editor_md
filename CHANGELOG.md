# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project currently uses Semantic Versioning as a release target. Dates and released versions are added only when a release is actually published.

## [Unreleased]

### Added

- Added contributor guidance covering development setup, issues, pull requests, tests, code style, and commit suggestions.
- Added a GitHub Actions workflow that installs the locked npm dependencies, runs the repository's existing Vitest files directly, and runs the existing production build script on pushes and pull requests.

### Changed

- Rewrote the README to describe the current open-source, local-first Markdown editor, its CodeMirror 6 + Tauri inline/live preview architecture, implemented Markdown features, development commands, screenshots status, license, and v0.1.0 readiness.

There is no dated `[0.1.0]` release entry yet. The `0.1.0` values in package and Tauri metadata should not be read as evidence that a release, tag, or distribution has been published.
