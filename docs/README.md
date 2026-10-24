---
title: Magic-Resume docs index
type: reference
status: Living
owner: kaihuang
created: 2026-07-03
updated: 2026-09-27
summary: Index for Magic-Resume documentation, grouped by document type.
scope: [docs]
repos: [Magic-Resume]
related: [CONVENTIONS.md]
---

# Magic-Resume Docs

> 本目录的组织方式：类型分目录、每篇文档带 front-matter、一个主题只保留一个权威来源。

## Architecture

| 文档 | 状态 | 更新 | 摘要 |
|---|---|---:|---|
| [Magic Resume Frontend Monorepo & MCP Architecture](architecture/overview.md) | Living | 2026-07-03 | Frontend monorepo workspace layout, dependency direction, MCP package boundary, and migration phases. |
| [Magic Resume Schema](architecture/schema.md) | Living | 2026-07-03 | Shared resume schema exports, template ID contract, content compatibility, and JSON schema generation. |
| [Magic Resume Template System](architecture/template-system.md) | Living | 2026-07-03 | Template registry, preview assets, template authoring flow, and web integration boundaries. |

## Specs

| 文档 | 状态 | 更新 | 摘要 |
|---|---|---:|---|
| [GEO 方案](specs/geo/spec.md) | Draft | 2026-08-05 | 面向答案引擎的可引用性建设：清不实声明、统一实体定义、llms.txt 与对比表，站外痕迹与验证方法。 |
| [Landing 优化方案](specs/landing-optimization/spec.md) | Proposed | 2026-08-05 | 死资产清理、首屏 JS 移出关键路径、结构化数据补齐，以及默认语言 / 价格展示 / 社会证明三项决策。 |
| [Stage-First Editor Relayout](specs/editor-relayout/design.md) | Draft | 2026-07-03 | Design brief for restructuring the editor around a stage-first workflow. |
| [前端文案规范：专业语气](specs/ui-copy-professional/spec.md) | Implemented | 2026-09-27 | 把 Web、Landing 与组件内硬编码文案从口语化改为专业、克制、可信的书面语气：语气与人称规则、句式模板、术语表、中英文排版与约 70 条样例。 |

## Reference

| 文档 | 状态 | 更新 | 摘要 |
|---|---|---:|---|
| [Magic Resume MCP](reference/mcp.md) | Living | 2026-07-03 | Setup, exposed MCP tools/resources/prompts, editing rules, and runtime boundary notes. |

## Empty Buckets

- `adr/`: architecture decisions owned by this repo.
- `reviews/`: timestamped review snapshots.
- `archive/`: superseded or deprecated docs.
- `templates/`: starter templates for new docs.
- `_meta/`: machine-readable rules and front-matter schema.
