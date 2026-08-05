---
title: Magic-Resume docs index
type: reference
status: Living
owner: kaihuang
created: 2026-07-03
updated: 2026-08-05
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
| [AI Lab Canvas Real Actions](specs/ai-lab-canvas-real-actions/design.md) | Draft | 2026-07-04 | Frontend UX and service-boundary design for wiring canvas actions to real AI results. |
| [AI Lab Guided Create](specs/ai-lab-guided-create/design.md) | Draft | 2026-07-04 | Frontend UX and interaction design for the AI Lab guided resume creation flow. |
| [AI Lab Living Canvas](specs/ai-lab-living-canvas/design.md) | Draft | 2026-07-03 | UX design for element-scoped AI actions, proposals, review states, and microcopy in the editor canvas. |
| [AI Lab Frontend Refactor](specs/ai-lab-refactor-and-backend/design.md) | Draft | 2026-07-04 | Frontend-only design for the AI Lab feature root, service layer, canvas integration, and migration away from mock-only flows. |
| [GenUI Systematization](specs/genui-systematization/design.md) | Draft | 2026-07-04 | Frontend widget contract for rendering typed interactive assistant output. |
| [GEO 方案](specs/geo/spec.md) | Draft | 2026-08-05 | 面向答案引擎的可引用性建设：清不实声明、统一实体定义、llms.txt 与对比表，站外痕迹与验证方法。 |
| [Landing 优化方案](specs/landing-optimization/spec.md) | Proposed | 2026-08-05 | 死资产清理、首屏 JS 移出关键路径、结构化数据补齐，以及默认语言 / 价格展示 / 社会证明三项决策。 |
| [Magic-Resume Analytics Frontend Boundary](specs/analytics-sdk/design.md) | Draft | 2026-07-04 | Frontend-only analytics event catalog, privacy rules, and SDK integration boundary for Magic-Resume. |
| [Magic-Resume Frontend Backend Integration](specs/frontend-v2-backend-integration/design.md) | Draft | 2026-07-04 | Frontend-only integration boundary for API routing, auth forwarding, streaming events, and response normalization. |
| [Stage-First Editor Relayout](specs/editor-relayout/design.md) | Draft | 2026-07-03 | Design brief for restructuring the editor around a stage-first workflow. |

## Reference

| 文档 | 状态 | 更新 | 摘要 |
|---|---|---:|---|
| [Agent 工具授权前端速览](reference/agent-tool-approval-contract.md) | Living | 2026-07-04 | Frontend UX and state model for user approval before sensitive assistant actions. |
| [Magic Resume MCP](reference/mcp.md) | Living | 2026-07-03 | Setup, exposed MCP tools/resources/prompts, editing rules, and runtime boundary notes. |
| [Magic-Resume Tracking Plan](reference/tracking-plan.md) | Living | 2026-07-03 | Event tracking inventory for landing, dashboard, editor, settings, and AI Lab surfaces. |

## Empty Buckets

- `adr/`: architecture decisions owned by this repo.
- `reviews/`: timestamped review snapshots.
- `archive/`: superseded or deprecated docs.
- `templates/`: starter templates for new docs.
- `_meta/`: machine-readable rules and front-matter schema.
