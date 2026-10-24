# AGENTS.md

## Project

Magic Resume is a Turborepo monorepo for a local-only resume editor, the shared resume schema and templates, the MCP package, and the marketing and docs sites.

## Workspaces

- `apps/web`: Next.js app. Local-only: no login, no backend, data in IndexedDB. `pnpm check:local-only` fails when code that needs auth, a hosted backend or billing comes back.
- `apps/landing`, `apps/docs`: marketing site (Astro, on Vercel) and docs (Mintlify) for magic-resume.cn.
- `packages/resume-schema`: shared resume data contracts. Prefer adding shared schema/type changes here instead of duplicating shapes in apps.
- `packages/resume-templates`: template DSL, renderer, registry, manifests, and template assets convention.
- `packages/design-system`, `packages/icons`, `packages/utils`: tokens and styles, icons, small helpers.
- `packages/mcp`: local stdio MCP CLI/server. It talks to the Magic Resume API through PATs and must not depend on Next.js runtime, React components, browser APIs, or IndexedDB.
- `packages/tsconfig`: shared TypeScript configs.

## Commands

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
pnpm run test
```

Targeted checks:

```bash
pnpm --filter @magic-resume/resume-schema test
pnpm --filter @magic-resume/resume-templates build
pnpm --filter @magic-resume/mcp test
pnpm --filter @magic-resume/web lint
```

## Guardrails

- Keep `apps/web` local-only. Do not add accounts, a backend client, cloud sync, billing or a deployment-mode switch unless explicitly requested.
- Keep MCP tools schema-aware and patch-based. Avoid full resume rewrites.
- Keep template IDs aligned between `templateSchema` and `templateRegistry`.
