# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (run from repo root)
pnpm install

# Dev / build / lint / test — all workspaces via Turborepo
pnpm run dev
pnpm run build
pnpm run lint
pnpm run test

# Target a single workspace
pnpm --filter @magic-resume/web dev
pnpm --filter @magic-resume/web lint
pnpm --filter @magic-resume/resume-schema test
pnpm --filter @magic-resume/resume-templates build
pnpm --filter @magic-resume/mcp test

# i18n validation (runs automatically on staged files via lint-staged)
pnpm --filter @magic-resume/web i18n:check
```

## Monorepo Structure

This is a **pnpm + Turborepo** monorepo. The package manager is `pnpm@10.28.1`.

| Workspace | Package name | Purpose |
|---|---|---|
| `apps/web` | `@magic-resume/web` | Next.js 16 local-first editor and BYOK AI Lab |
| `apps/landing` | `@magic-resume/landing` | Marketing site for magic-resume.cn (Astro, Vercel) |
| `apps/docs` | — | Docs site (Mintlify) |
| `packages/design-system` | `@magic-resume/design-system` | Design tokens and shared styles |
| `packages/icons` | `@magic-resume/icons` | Icon set |
| `packages/mcp` | `@magic-resume/mcp` | stdio MCP server + CLI (Node ESM) |
| `packages/resume-schema` | `@magic-resume/resume-schema` | Shared Zod schemas, types, sample data |
| `packages/resume-templates` | `@magic-resume/resume-templates` | Template DSL, renderer, registry |
| `packages/tsconfig` | `@magic-resume/tsconfig` | Shared TypeScript configs |
| `packages/utils` | `@magic-resume/utils` | Dependency-light helpers (`cn`, time, color) |

**A workspace package that ships Tailwind classes must be declared with `@source` in `apps/web/src/app/globals.css`.** Tailwind v4 auto-detects sources from the build's cwd (`apps/web`) and never scans `packages/` — a missing entry emits no error, it just silently drops any utility the app itself doesn't also use.

## Architecture

### Local storage and BYOK AI (`apps/web`)

Resume editing and export run locally without an account or backend. Resumes and a single conversation per resume persist in IndexedDB, without an expiry. AI Lab retains chat, skills, approvals, plans, tools, sources and GenUI cards, using only the user's model key. All AI requests go through Next.js routes to the separately deployed `AI_BACKEND_URL`. The backend implementation is not included; implement the contract in `docs/reference/ai-backend.md`. There is no cloud sync, billing, memory, interview or conversation-history browser.

`pnpm check:local-only` (`scripts/check-local-only.mjs`, part of `pnpm lint` and CI) fails on markers of that code: `@clerk/`, `/api/billing`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_MODE`, `commercial`, and so on.

`src/lib/extensions/app-lifecycle.ts` is a set of no-op hooks the app calls at measurable moments (resume created, exported, error caught). A deployment that wants analytics replaces the bodies.

### State management (`apps/web`)

Zustand + Immer stores in `src/store/`:

- **`useResumeStore`**: primary resume state, persisted to IndexedDB. `store/resume/*` are typed projections of it; see `store/resume/README.md`.
- **`useSettingStore`**: BYOK provider, encrypted API key, model, URL, token limit and reasoning strength.
- **`useAiSessionStore`**: one local conversation per resume, no expiry or cloud restore.
- **`useSettingsUiStore`**: whether the settings modal is open. Theme and language persist on their own (`ThemeProvider`, `i18n.ts`).

IndexedDB persistence is handled by `src/lib/api/IndexDBClient.ts` (db name: `MagicResumeDB`).

### Builds

`apps/web/scripts/next.mjs` wraps `next <command>` only to drop the bare `--` pnpm passes through. Dev and build use Turbopack (Next 16 default). `next build` type-checks with `tsconfig.build.json`, which leaves out tests and `scripts/`: several tests still reference modules v3 removed and are due to be reworked with the test setup.

### Resume schema (`packages/resume-schema`)

Single source of truth for the resume data shape. Exports:
- `resumeSchema` (Zod), `Resume` type, and all sub-schemas
- `templateIds` / `templateSchema` — the canonical list of valid template IDs
- `defaultResume`, `sampleResume`
- `resumeJsonSchema` (JSON Schema for MCP resources)

Build generates `dist/` and also runs `scripts/write-schema.mjs` to emit `dist/schema.json`.

### Template system (`packages/resume-templates`)

Templates are defined using the `MagicTemplateDSL` interface, which includes `designTokens`, layout config, and section definitions. All templates are registered in `src/registry.ts` (`templateRegistry`).

**Template IDs must remain in sync** between `packages/resume-schema` (`templateIds`) and `packages/resume-templates` (`templateRegistry`).

Preview thumbnails are static assets at `apps/web/public/templates/jpg/{templateId}.jpg`.

### MCP package (`packages/mcp`)

A **Node.js ESM** package — no React, no browser APIs, no IndexedDB. It communicates with the Magic Resume API (magic-resume.cn) using Personal Access Tokens (PATs).

Config is stored at `~/.magic-resume/mcp.json` (set via `magic-resume config set --api-url <url> --pat <token>`).

The MCP server (`src/server.ts`) exposes tools via `@modelcontextprotocol/sdk`. Resume mutations use JSON Patch (`fast-json-patch`) — always patch-based, never full rewrites. Key helper logic is in `src/resume-tools.ts`.

## Environment variables

None are required for editing. AI requires server-only `AI_BACKEND_URL` and a BYOK configuration in Settings → Model. `apps/web/.env.example` also lists `NEXT_PUBLIC_APP_URL` / `APP_PUBLIC_URL` (public origin for robots and metadata) and `NEXT_PUBLIC_DOCS_URL` (help menu link).

## Commit messages

This repo enforces gitmoji + conventional-type commits via Husky `commit-msg` → `commitlint`.

Format: `<emoji> <type>(<scope>?): <subject>` — e.g. `:sparkles: feat(web): add resume share link generator`. Type must be one of `build|ci|chore|docs|feat|fix|perf|refactor|revert|style|test|wip`. See `.claude/skills/commit/SKILL.md` for the emoji map, examples, and the dry-run command. **Do not use `--no-verify`** — fix the message instead.

## Guardrails

- Keep resume storage local and AI BYOK-only. Route backend calls through `lib/ai/backend.ts`. Do not add accounts, cloud sync, billing, memory, interviews or a deployment-mode switch unless explicitly requested.
- MCP tools must remain schema-aware and patch-based. The `@magic-resume/mcp` package must not import from Next.js, React components, browser APIs, or IndexedDB.
- When adding shared schema or type changes, prefer `packages/resume-schema` over duplicating shapes in `apps/web`.
- Keep template IDs aligned: any new `templateId` added to `packages/resume-schema` must have a corresponding entry in `packages/resume-templates/src/registry.ts`, and a thumbnail at `apps/web/public/templates/jpg/{id}.jpg`.

## Design Context

> Full version + design principles live in `.impeccable.md` (project root); read it before any UI / UX work.

- **Users**: 求职者(中文市场为主),为某个目标岗位搭建 / 打磨简历。`create`(引导创建)服务"从零 / 另起一份"的人——含经验少需引导者与求快出稿者;其余能力面向已有简历、准备投递的人。
- **Personality**: 专业、克制、可信。像素小蓝宠只保留为视觉形象,不进文案;界面与 AI 对话都用书面、准确的表达,不用语气词、不拟人。UI 微文案简短、动词开头;AI 对话可完整说明理由,但不注水、不复述用户已见。完整规范见 `docs/specs/ui-copy-professional/spec.md`。
- **Aesthetic**: 深色工作台 `#0A0A0A` + sky `#38bdf8` 点缀、少 border;简历修订红删 `#dc2626` / 绿增 `#15803d`。动效轻快贴元素,仅 transform / opacity,不弹跳。Anti:花哨空洞、冷冰冰填表、AI 不可控、冗长问卷。
- **Principles**: ①画布是舞台,对话是旁白 ②能力按需浮现 ③AI 是合作者(改动先提案、可拒绝、有理由、可跳过) ④就地而非另开 ⑤脚手架不是栅栏(给起点也允许自由表达 / 跳过)。
