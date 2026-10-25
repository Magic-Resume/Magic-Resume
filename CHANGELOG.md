# Changelog

All notable changes to Magic Resume are documented in this file.

# [v3.0.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.8.1...v3.0.0) (2026-10-25)

## ✨ New Features
- [`4c696a6`](https://github.com/Magic-Resume/Magic-Resume/commit/4c696a6)  feat(web): restore local BYOK AI Lab and fix light theme 
- [`20fb7e4`](https://github.com/Magic-Resume/Magic-Resume/commit/20fb7e4)  feat(agent): stream chat through the user&#x27;s own model 
- [`5da32e1`](https://github.com/Magic-Resume/Magic-Resume/commit/5da32e1)  feat(agent): run AI Lab on a resumable DeepAgents harness 
- [`5955715`](https://github.com/Magic-Resume/Magic-Resume/commit/5955715)  feat(agent): import documents, edit snippets and test connections 
- [`c3ffce6`](https://github.com/Magic-Resume/Magic-Resume/commit/c3ffce6)  feat(agent): add conversation attachments and optional web search 

## 🐛 Bug Fixes
- [`c684e70`](https://github.com/Magic-Resume/Magic-Resume/commit/c684e70)  fix(web): preserve local resumes on direct imports 
- [`71c6b4f`](https://github.com/Magic-Resume/Magic-Resume/commit/71c6b4f)  fix(web): confirm replacing the single local AI session 
- [`b9ef4f9`](https://github.com/Magic-Resume/Magic-Resume/commit/b9ef4f9)  fix(web): point model errors back at the user&#x27;s own key 
- [`9f8418d`](https://github.com/Magic-Resume/Magic-Resume/commit/9f8418d)  fix(agent): show plans, emit each skill once and deepen the skill guides 
- [`d4613e2`](https://github.com/Magic-Resume/Magic-Resume/commit/d4613e2)  fix(agent): keep streamed replies as one string in history 
- [`7be5962`](https://github.com/Magic-Resume/Magic-Resume/commit/7be5962)  fix(agent): count attachment text as evidence for resume facts 
- [`9add5c5`](https://github.com/Magic-Resume/Magic-Resume/commit/9add5c5)  fix(agent): pick the vision probe color at random 
- [`0c327cc`](https://github.com/Magic-Resume/Magic-Resume/commit/0c327cc)  fix(agent): check resume facts against attachment text 
- [`3aba9ba`](https://github.com/Magic-Resume/Magic-Resume/commit/3aba9ba)  fix(web): explain unverifiable attachments and fold long fact lists 
- [`ba746b3`](https://github.com/Magic-Resume/Magic-Resume/commit/ba746b3)  fix(agent): copy tool-call messages by field instead of spreading them 
- [`78d1304`](https://github.com/Magic-Resume/Magic-Resume/commit/78d1304)  fix(web): stop offering the deleted favicon proxy as a fallback 

## 🔒 Security Issues
- [`c7d9673`](https://github.com/Magic-Resume/Magic-Resume/commit/c7d9673)  chore: keep private repository references out of the public tree 
- [`697c6f3`](https://github.com/Magic-Resume/Magic-Resume/commit/697c6f3)  fix(agent): limit requests per client address 
- [`5330f79`](https://github.com/Magic-Resume/Magic-Resume/commit/5330f79)  fix: strip markup to a fixed point and keep worker code constant 

## 💥 Breaking Changes
- [`0307e95`](https://github.com/Magic-Resume/Magic-Resume/commit/0307e95)  feat(web): make the open-source app local-only

# [v2.8.1](https://github.com/Magic-Resume/Magic-Resume/compare/v2.8.0...v2.8.1) (2026-10-24)

## 🐛 Bug Fixes
- [`874b303`](https://github.com/Magic-Resume/Magic-Resume/commit/874b303)  fix(templates): 修复 Blue Line 联系方式对齐与长链接越界 (#268) (Issues: [`#268`](https://github.com/Magic-Resume/Magic-Resume/issues/268))

# [v2.8.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.7.0...v2.8.0) (2026-10-20)

## ✨ New Features
- [`2bf7aec`](https://github.com/Magic-Resume/Magic-Resume/commit/2bf7aec)  feat: merge frontend release 2026-10-19 [skip ci] 
- [`aa36b9b`](https://github.com/Magic-Resume/Magic-Resume/commit/aa36b9b)  feat(web): add voice interview setup and announcement carousel (Issues: [`#265`](https://github.com/Magic-Resume/Magic-Resume/issues/265))

# [v2.6.5](https://github.com/Magic-Resume/Magic-Resume/compare/v2.6.4...v2.6.5) (2026-10-12)

## 🐛 Bug Fixes
- [`8d8eac2`](https://github.com/Magic-Resume/Magic-Resume/commit/8d8eac2)  fix(web): preserve human answers and unblock GenUI interactions (#253) (#254) (Issues: [`#253`](https://github.com/Magic-Resume/Magic-Resume/issues/253) [`#254`](https://github.com/Magic-Resume/Magic-Resume/issues/254))

# [v2.6.3](https://github.com/Magic-Resume/Magic-Resume/compare/v2.6.2...v2.6.3) (2026-10-09)

## 🐛 Bug Fixes
- [`cf0ed3c`](https://github.com/Magic-Resume/Magic-Resume/commit/cf0ed3c)  fix(web): 强度选择器提示实际生效档位，编辑区禁用页面翻译 
- [`37886b8`](https://github.com/Magic-Resume/Magic-Resume/commit/37886b8)  fix(web): 会话状态解开响应信封，挂起的选择卡不再被误判过期

# [v2.6.2](https://github.com/Magic-Resume/Magic-Resume/compare/v2.6.1...v2.6.2) (2026-09-27)

# [v2.6.1](https://github.com/Magic-Resume/Magic-Resume/compare/v2.6.0...v2.6.1) (2026-09-26)

## 🐛 Bug Fixes
- [`8ab7068`](https://github.com/Magic-Resume/Magic-Resume/commit/8ab7068)  fix(web): 解析模型改由服务端决定，并修正错误文案措辞 (#226) (Issues: [`#226`](https://github.com/Magic-Resume/Magic-Resume/issues/226))

# [v2.6.0](https://github.com/Magic-Resume/Magic-Resume/compare/v2.5.2...v2.6.0) (2026-09-11)

## ✨ New Features
- [`1a8e35c`](https://github.com/Magic-Resume/Magic-Resume/commit/1a8e35c)  feat(web): read public app URL at runtime (#205) (Issues: [`#205`](https://github.com/Magic-Resume/Magic-Resume/issues/205))

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
