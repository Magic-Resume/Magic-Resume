# AGENTS.md

## Project

Magic Resume is a Turborepo monorepo for a local-first resume editor with an optional BYOK AI Lab and the marketing and docs sites. Shared resume packages and MCP are maintained in [magic-resume-kit](https://github.com/Magic-Resume/magic-resume-kit) and published on npm as `@magic-resume-kit/*`.

## Workspaces

- `apps/web`: Next.js app. No login or billing; resumes and one AI conversation per resume stay in IndexedDB. Optional AI requests go through server routes to `AI_BACKEND_URL`, a separately deployed BYOK backend. See `docs/reference/ai-backend.md`.
- `apps/landing`, `apps/docs`: marketing site (Astro, on Vercel) and docs (Mintlify) for magic-resume.cn.
- `@magic-resume-kit/resume-schema`: shared resume data contracts. Make shared schema/type changes in the kit repository instead of duplicating shapes in apps.
- `@magic-resume-kit/resume-templates`: template DSL, renderer, registry, manifests, and template assets convention. Consumed from npm with an exact version.
- `packages/genui`: shared components and widgets for AI Lab. Keep its Tailwind `@source` and Docker dependency entry.
- `@magic-resume-kit/design-system`, `@magic-resume-kit/icons`, `@magic-resume-kit/utils`: npm dependencies for tokens and styles, icons, and small helpers. Keep Tailwind scanning the installed package `dist` directories.
- `@magic-resume-kit/mcp`: independently installed stdio MCP CLI/server, maintained in the kit repository. It talks to the Magic Resume API through PATs, not the local editor's IndexedDB; it is not a Web dependency.
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
pnpm --filter @magic-resume/genui build
pnpm --filter @magic-resume/web lint
pnpm check:tailwind
pnpm check:local-only
```

## Guardrails

- Keep resume storage local and AI BYOK-only. Use `lib/ai/backend.ts` for AI backend calls; never expose its address in browser code. Do not add accounts, cloud sync, billing, memory, interviews or a deployment-mode switch unless explicitly requested.
- Keep MCP tools schema-aware and patch-based. Avoid full resume rewrites.
- Keep template IDs aligned between `templateSchema` and `templateRegistry`.
