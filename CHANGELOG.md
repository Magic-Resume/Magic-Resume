# Changelog

All notable changes to Magic Resume are documented in this file.

# v1.0.0 (2026-08-03)

## ✨ New Features
- [`7dd2b74`](https://github.com/Magic-Resume/Magic-Resume/commit/7dd2b74)  feat(web): stream PDF import with scanline parse progress (#129) (Issues: [`#129`](https://github.com/Magic-Resume/Magic-Resume/issues/129))
- [`6c18398`](https://github.com/Magic-Resume/Magic-Resume/commit/6c18398)  feat(web): add switchable light theme (#130) (Issues: [`#130`](https://github.com/Magic-Resume/Magic-Resume/issues/130))
- [`bd928d2`](https://github.com/Magic-Resume/Magic-Resume/commit/bd928d2)  feat(web): render resume preview with PDF canvas (#120) (Issues: [`#120`](https://github.com/Magic-Resume/Magic-Resume/issues/120))
- [`ae2779e`](https://github.com/Magic-Resume/Magic-Resume/commit/ae2779e)  feat(web): default system theme + credit-free monthly quota UI (#149) (Issues: [`#149`](https://github.com/Magic-Resume/Magic-Resume/issues/149))
- [`df9e30c`](https://github.com/Magic-Resume/Magic-Resume/commit/df9e30c)  feat(web): mark the pages a conversion passes through (#153) (#154) (Issues: [`#153`](https://github.com/Magic-Resume/Magic-Resume/issues/153) [`#154`](https://github.com/Magic-Resume/Magic-Resume/issues/154))
- [`18d99bd`](https://github.com/Magic-Resume/Magic-Resume/commit/18d99bd)  feat: add compact Chinese photo resume template (#156) (Issues: [`#156`](https://github.com/Magic-Resume/Magic-Resume/issues/156))

## 🐛 Bug Fixes
- [`f081266`](https://github.com/Magic-Resume/Magic-Resume/commit/f081266)  fix(web): keep chat-agent SSE unbuffered through nginx (#121) (Issues: [`#121`](https://github.com/Magic-Resume/Magic-Resume/issues/121))
- [`64507b0`](https://github.com/Magic-Resume/Magic-Resume/commit/64507b0)  fix(web): unwrap pdf parse backend response (#122) (Issues: [`#122`](https://github.com/Magic-Resume/Magic-Resume/issues/122))
- [`caaf8ab`](https://github.com/Magic-Resume/Magic-Resume/commit/caaf8ab)  fix(web): move window.__ENV injection out of the commercial-overlaid runtime module (#147) (Issues: [`#147`](https://github.com/Magic-Resume/Magic-Resume/issues/147))

## 🔒 Security Issues
- [`4d1205a`](https://github.com/Magic-Resume/Magic-Resume/commit/4d1205a)  chore: remove OSS analytics facade (#114) (Issues: [`#114`](https://github.com/Magic-Resume/Magic-Resume/issues/114))

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
