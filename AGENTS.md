# AGENTS.md

## Project

Magic Resume is a Turborepo monorepo for a local-first resume editor with an optional BYOK AI Lab, the shared resume schema and templates, the MCP package, and the marketing and docs sites.

## Workspaces

- `apps/web`: Next.js app. No login or billing; resumes and one AI conversation per resume stay in IndexedDB. Optional AI requests go through server routes to `AI_BACKEND_URL`, a separately deployed BYOK backend. See `docs/reference/ai-backend.md`.
- `apps/landing`, `apps/docs`: marketing site (Astro, on Vercel) and docs (Mintlify) for magic-resume.cn.
- `packages/resume-schema`: shared resume data contracts. Prefer adding shared schema/type changes here instead of duplicating shapes in apps.
- `packages/resume-templates`: template DSL, renderer, registry, manifests, and template assets convention.
- `packages/genui`: shared components and widgets for AI Lab. Keep its Tailwind `@source` and Docker dependency entry.
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

- Keep resume storage local and AI BYOK-only. Use `lib/ai/backend.ts` for AI backend calls; never expose its address in browser code. Do not add accounts, cloud sync, billing, memory, interviews or a deployment-mode switch unless explicitly requested.
- Keep MCP tools schema-aware and patch-based. Avoid full resume rewrites.
- Keep template IDs aligned between `templateSchema` and `templateRegistry`.
