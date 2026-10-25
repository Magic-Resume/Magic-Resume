# Contributing to Magic Resume

Thanks for your interest in contributing! Contributions of every size are welcome — bug fixes, templates, AI Lab skills, docs, translations, or features.

**English** · [简体中文](./CONTRIBUTING.zh-CN.md)

---

## Ways to contribute

- **Report a bug** or request a feature — open an [issue](https://github.com/Magic-Resume/Magic-Resume/issues).
- **Fix a bug** or **build a feature** — open a Pull Request.
- **Add a template** — templates live in [`packages/resume-templates`](https://github.com/Magic-Resume/magic-resume-kit/tree/main/packages/resume-templates) of magic-resume-kit.
- **Write or improve an AI Lab skill** — see [AI Lab and the agent](#ai-lab-and-the-agent).
- **Improve translations** — see [Translations](#translations).
- **Improve the docs** — including this file and the READMEs.

For anything non-trivial, opening an issue first to discuss the approach saves everyone time.

---

## Prerequisites

- **Node.js** `>= 22.13`
- **pnpm** `>= 10.28.1` (this repo pins `pnpm@10.28.1` via `packageManager`)

## Local setup

The editor runs entirely in the browser and needs no database or `.env` file. Only AI Lab needs the agent in `apps/agent`, which `pnpm run dev` starts as well.

```bash
# 1. Fork, then clone your fork
git clone https://github.com/<you>/Magic-Resume.git
cd Magic-Resume

# 2. Install and run
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). To use AI Lab, copy `apps/web/.env.example` to `apps/web/.env.local`, uncomment `AI_BACKEND_URL=http://localhost:4000`, restart, and add your model key in **Settings → Model**. See the [README](./README.md#repository-layout) for the repository layout.

---

## Development workflow

1. Create a branch off `master`:

   ```bash
   git checkout -b feat/your-thing   # or fix/…, docs/…, refactor/…
   ```

2. Make your change. Keep it focused — one concern per PR.

3. Before committing, make sure the checks pass:

   ```bash
   pnpm run lint
   pnpm run test
   pnpm --filter @magic-resume/agent typecheck   # when you change apps/agent
   ```

   > The `pre-commit` hook also runs `lint` + `build` automatically. Don't bypass it with `--no-verify`.

---

## Commit convention

This repo enforces **gitmoji + [Conventional Commits](https://www.conventionalcommits.org/)** through a `commitlint` hook (`commitlint-config-gitmoji`). Any message that doesn't match is **rejected**.

### Format

```
<emoji> <type>(<scope>?): <subject>
```

- **emoji** — a gitmoji shortcode (`:sparkles:`) or the unicode char (`✨`). Must be a valid code from [gitmoji.dev](https://gitmoji.dev).
- **type** — exactly one of: `build · ci · chore · docs · feat · fix · perf · refactor · revert · style · test · wip` (lowercase).
- **scope** — optional, lowercase workspace name: `web`, `agent`, `genui`, `landing`, `docs`. Schema, template, design-system and MCP changes belong in [magic-resume-kit](https://github.com/Magic-Resume/magic-resume-kit).
- **subject** — imperative ("add", not "added"), no trailing period, whole header ≤ 100 chars.

Body and footer are optional; if present, precede each with a blank line.

### Emoji → intent (most common)

| Intent | Emoji | Type |
|---|---|---|
| New feature | `:sparkles:` ✨ | `feat` |
| Bug fix | `:bug:` 🐛 | `fix` |
| Docs | `:memo:` 📝 | `docs` |
| Refactor | `:recycle:` ♻️ | `refactor` |
| Performance | `:zap:` ⚡️ | `perf` |
| UI / styling | `:lipstick:` 💄 | `style` |
| Code format / structure | `:art:` 🎨 | `style` |
| Tests | `:white_check_mark:` ✅ | `test` |
| Config / tooling | `:wrench:` 🔧 | `chore` |
| Bump deps | `:arrow_up:` ⬆️ | `chore` |
| Remove code / files | `:fire:` 🔥 | `chore`, `refactor` |
| i18n | `:globe_with_meridians:` 🌐 | `feat` |

Full list: [gitmoji.dev](https://gitmoji.dev).

### Examples

```bash
# ✅ pass
:sparkles: feat(web): add resume share link generator
:bug: fix(agent): keep item ids when translating a resume
:memo: docs: rewrite contributing guide

# ❌ fail
feat: add dark mode                 # no emoji
:sparkles: Feat: add dark mode      # type must be lowercase
:sparkles: feat: add dark mode.     # trailing period
```

### Check a message before committing

```bash
echo ":sparkles: feat(web): add resume share link generator" | npx --no -- commitlint
```

Exit `0` means it's valid; a non-zero exit prints the rule that failed.

---

## AI Lab and the agent

`apps/agent` is the backend AI Lab talks to. Its architecture is described in [docs/specs/agent-backend/design.md](./docs/specs/agent-backend/design.md), and the protocol between the editor and the agent in [docs/reference/ai-backend.md](./docs/reference/ai-backend.md). Change the two sides together: a new event or field must work in the editor and be documented in the contract.

- **Skills** are Markdown in `apps/agent/skills/<name>/SKILL.md`, with optional `references/` and `assets/`. The frontmatter's `allowed-tools` is enforced, so list every tool the skill needs. Keep instructions general and never put real people's data in examples; use clearly fictional names and `example.com` addresses.
- **Tests** use Node's test runner and a fake OpenAI-compatible server, so they need no API key: `pnpm --filter @magic-resume/agent test`. Add a scenario test for any change to what the agent streams or stores.
- **Trying it with a real model**: `apps/agent/README.md` describes a smoke test against any OpenAI-compatible endpoint. To use a model server on your own machine, start the agent with `AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true`.
- **Never log or persist model keys**, and keep the resume out of Ask mode. Reviews check both.

---

## Translations

The web app uses [i18next](https://www.i18next.com/). Translation files live under `apps/web/src/locales/`. After editing them, validate key parity:

```bash
pnpm --filter @magic-resume/web i18n:check
```

---

## Pull request process

1. Push your branch and open a [Pull Request](https://github.com/Magic-Resume/Magic-Resume/pulls) against `master`.
2. Write a clear title (the commit convention is a good guide) and describe **what** changed and **why**.
3. Link any related issue (e.g. `Closes #123`).
4. Make sure CI, lint, and tests are green.

A maintainer will review as soon as they can. Thanks for helping make Magic Resume better! 🎉

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
