# Changelog

All notable changes to Magic Resume are documented in this file.

# [v2.5.2](https://github.com/Magic-Resume/Magic-Resume/compare/v2.5.1...v2.5.2) (2026-08-09)

## 🐛 Bug Fixes
- [`247e384`](https://github.com/Magic-Resume/Magic-Resume/commit/247e384)  fix(web): LLM 配置体验与错误反馈优化 (#181) (Issues: [`#181`](https://github.com/Magic-Resume/Magic-Resume/issues/181))

# [v2.5.1](https://github.com/Magic-Resume/Magic-Resume/compare/v2.5.0...v2.5.1) (2026-08-05)

# [v2.5.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.4.0...v2.5.0) (2026-07-30)

## ✨ New Features
- [`438aa8b`](https://github.com/Magic-Resume/Magic-Resume/commit/438aa8b)  feat: add compact Chinese photo resume template (#156) (Issues: [`#156`](https://github.com/Magic-Resume/Magic-Resume/issues/156))

# [v2.4.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.3.0...v2.4.0) (2026-07-29)

## ✨ New Features
- [`1f22274`](https://github.com/Magic-Resume/Magic-Resume/commit/1f22274)  feat(web): mark the pages a conversion passes through (#153) (#154) (Issues: [`#153`](https://github.com/Magic-Resume/Magic-Resume/issues/153) [`#154`](https://github.com/Magic-Resume/Magic-Resume/issues/154))

# [v2.3.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.2.1...v2.3.0) (2026-07-23)

## ✨ New Features
- [`ce42675`](https://github.com/Magic-Resume/Magic-Resume/commit/ce42675)  feat(web): default system theme + credit-free monthly quota UI (#149) (Issues: [`#149`](https://github.com/Magic-Resume/Magic-Resume/issues/149))

# [v2.2.1](https://github.com/Magic-Resume/Magic-Resume/compare/v2.2.0...v2.2.1) (2026-07-23)

## 🐛 Bug Fixes
- [`52b6533`](https://github.com/Magic-Resume/Magic-Resume/commit/52b6533)  fix(web): move window.__ENV injection out of the commercial-overlaid runtime module (#147) (Issues: [`#147`](https://github.com/Magic-Resume/Magic-Resume/issues/147))

# [v2.2.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.1.1...v2.2.0) (2026-07-13)

## ✨ New Features
- [`5d9cf3f`](https://github.com/Magic-Resume/Magic-Resume/commit/5d9cf3f)  feat(web): render resume preview with PDF canvas (#120) (Issues: [`#120`](https://github.com/Magic-Resume/Magic-Resume/issues/120))

# [v2.1.1](https://github.com/LinMoQC/Magic-Resume/compare/v2.1.0...v2.1.1) (2026-07-07)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-07-04

### Added

- Added a standalone Astro landing site with configurable links to the production web app.
- Added conversational AI editing, patch review, editable canvas interactions, and reusable AI Lab widgets.
- Added browser and PDF rendering improvements, bundled Chinese fonts, and editable resume canvas support.
- Added centralized frontend utilities, validation schemas, API route definitions, tests, and translations.

### Changed

- Refreshed the dashboard, resume editor, templates, account flows, settings, and responsive navigation.
- Reorganized public frontend documentation under `docs/` using a consistent architecture, reference, and specification structure.
- Updated the Docker build and GitHub Container Registry publishing workflow for the monorepo.

### Security

- Removed internal backend implementation details from public frontend documentation and comments.
- Removed the open-source analytics facade and retained privacy boundary checks.

[Unreleased]: https://github.com/LinMoQC/Magic-Resume/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/LinMoQC/Magic-Resume/releases/tag/v2.0.0
