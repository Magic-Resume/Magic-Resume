# Resume agent service

A self-hosted, single-user BYOK backend for the local resume editor. It runs a DeepAgents tool loop, streams review proposals and pauses for structured input. Resume acceptance and durable conversation history remain in the browser. Model credentials are required on every chat or approval request and are never stored in checkpoints or application logs.

## Architecture

`http → engine → harness → model`, with shared contracts and persistence as leaf modules:

- `src/http`: Fastify request parsing, JSON session endpoints, and the SSE opening deadline. Configuration and provider failures before model output remain HTTP errors; failures after opening become `error` followed by `done`.
- `src/engine`: per-turn execution, event translation, proposal accumulation, approval validation, session queries, release and regeneration forks.
- `src/harness`: the sole `createDeepAgent` call, native planning, filesystem, skills and delegation; nine ordered policies enforce budgets, retries, recovery, permission modes, skill tool restrictions, read-only skill files, resume validation and fact verification.
- `src/model`: OpenAI-compatible Chat Completions, reasoning deltas, one-time unsupported-effort negotiation, DNS-pinned outbound fetch, redirect rejection and per-connection idle timeouts. Retries occur only before output, for transient failures.
- `src/persistence`: SQLite graph checkpoints and `turns` / `approvals` metadata in the same database. Each run constructs a fresh harness and model; keys and provider configuration stay in request-local closures.

The virtual filesystem mounts shipped skills at `/skills/` and uses graph state for the remaining paths. The browser's current snapshot seeds `/workspace/resume.json` at each new turn; existing drafts are not silently treated as accepted changes. Complete resume metadata omitted by the browser is filled from the public schema package's defaults. Writes are schema-validated before producing RFC 6902 preview `resume_patch` events and one final authoritative `resume_update` proposal, including when pausing for input. Preview compatibility is tested against the editor's actual patch projection.

`cocreate` can propose edits; `plan` cannot write the resume; `ask` has neither a seeded resume nor resume tools or subagents. Entering Ask resets server-side model context, including native cached summaries, to the latest question so an earlier resume read cannot leak through history. The browser transcript remains intact. An approval from a resume-aware run must be resolved in that mode before switching to Ask; a scope-changing approval returns a conflict. Approval continuation restores the original workflow and active skill when the browser omits them.

This pinned DeepAgents version resolves profiles from model metadata. Stable local profile identifiers disable Ask's default subagent and enable native todo tools, while the actual provider model name stays unchanged. The permission instruction is also placed last at the model boundary, after native skill and context instructions. A small pnpm patch fixes mixed edit/reject decisions in the pinned LangChain HITL middleware so submitted answers are not discarded when a different card is skipped.

## Run locally

Use Node 22.22.2 and pnpm 10.28.1 from the repository root:

```sh
source ~/.nvm/nvm.sh
nvm use 22
pnpm install
cp apps/agent/.env.example apps/agent/.env
pnpm --filter @magic-resume/agent dev
```

The service listens at `http://127.0.0.1:4000`. `GET /health` returns `{ "ok": true }`. Build and start with `pnpm --filter @magic-resume/agent build` and `pnpm --filter @magic-resume/agent start`.

Point the web server's **server-only** `AI_BACKEND_URL` at this origin, without `/api`. Browser requests still use same-origin Next.js proxy routes. See [the backend contract](../../docs/reference/ai-backend.md) for request and event shapes.

Implemented endpoints:

| Method | Path                            | Result                                                 |
| ------ | ------------------------------- | ------------------------------------------------------ |
| POST   | `/api/chat`                     | SSE agent run                                          |
| POST   | `/api/chat/approve`             | SSE continuation                                       |
| GET    | `/api/chat/session?sessionId=…` | `{ data: { state, checkpointId?, pendingApproval? } }` |
| POST   | `/api/chat/session/fork`        | `{ data: { checkpointId? } }`                          |
| DELETE | `/api/chat/session`             | `{ data: { released: true } }`                         |

Snippet editing, AI import, model connection testing, attachments and web search belong to later milestones. A one-shot request without `sessionId` has no checkpointer or blocking form/choice tools. When required evidence is missing it asks in text.

## Configuration

All configuration comes from environment variables; `.env.example` lists the complete M1 set. Model keys, base URLs, names, token limits and reasoning effort are request fields rather than server defaults.

| Variable                          | Default              | Meaning                                                                 |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `HOST` / `PORT`                   | `127.0.0.1` / `4000` | Listen address                                                          |
| `AGENT_DATA_DIR`                  | `./data`             | Directory containing `checkpoints.sqlite` and SQLite WAL files          |
| `AGENT_SKILLS_DIR`                | packaged `skills/`   | Read-only skill catalog                                                 |
| `AGENT_MAX_MODEL_CALLS`           | `40`                 | Shared root, subagent and assessment budget, including the final answer |
| `AGENT_MAX_TOOL_CALLS`            | `60`                 | Shared tool budget                                                      |
| `AGENT_IDLE_TIMEOUT_MS`           | `120000`             | Maximum gap between upstream bytes, including the first byte            |
| `AGENT_RUN_TIMEOUT_MS`            | `900000`             | Whole HTTP run limit                                                    |
| `AGENT_FIRST_EVENT_WAIT_MS`       | `15000`              | Maximum delay before SSE headers open                                   |
| `AGENT_SESSION_TTL_HOURS`         | `168`                | Expire inactive runtime threads; browser history has its own lifetime   |
| `AGENT_BODY_LIMIT_BYTES`          | `2097152`            | HTTP JSON body limit                                                    |
| `AGENT_ALLOW_PRIVATE_MODEL_HOSTS` | `false`              | Allow local/private model endpoints in non-production environments only |

The server logs a fixed warning and ignores private-host opt-in in production. Public outbound model endpoints are DNS-validated once per run and every connection is pinned to the validated address; redirects are rejected. Inherited tracing and verbose provider logging are disabled.

Use one service process per data directory. The database holds temporary messages, resume drafts and tool results, so keep the directory private. Session deletion removes checkpoints, turns and approvals. A background sweep reclaims inactive threads; expiry does not delete the browser's transcript. A claimed approval is consumed once execution may have started, including after cancellation, so an uncertain outcome is inspected through session state rather than replayed automatically.

Docker Compose stores runtime state in the `agent-data` volume and does not publish an agent port. The Alpine image builds `better-sqlite3` with Python, make and a C++ compiler, ships the skill assets, and runs a SQLite saver load/query check as its unprivileged runtime user during the image build. Protect any shared or public deployment at a reverse proxy; the service does not implement multi-user authentication.

## Extend the skill catalog

Add `skills/<name>/SKILL.md` with YAML frontmatter containing `name`, `description` and `allowed-tools`. The name must match its directory. Include goal, appropriate and inappropriate uses, prerequisites, steps, completion criteria, failure handling and output constraints. Put concise supporting material under `references/` or `assets/`.

The five shipped skills cover creation, optimization, analysis, fit and translation. DeepAgents discovers descriptions and reads full bodies on demand. Add a mode mapping in `src/harness/skills/catalog.ts` only when adding an explicit UI entry. User-defined skill IDs are ignored with a fixed warning in this release.

`read_file`, `ls`, `glob`, `grep` and `write_todos` are always available to a loaded skill. Other tools require its explicit `allowed-tools` declaration. Loading a different skill replaces the previous active permission set; analysis and fit cannot acquire write access from an earlier skill. The mode boundary remains stronger than a skill's declaration.

The Zod widget registry mirrors every frontend card name for compatibility. `push_ui` exposes the supported non-blocking cards only. Forms and choices use native interrupts; unavailable application features are never simulated with cards. Merged card updates are validated as complete cards before publication.

## Smoke test with a real compatible model

1. Start a local OpenAI-compatible proxy that supports streamed Chat Completions and function tools. Record its `/v1` base URL, model name and key. Confirm the proxy is reachable from the agent process.
2. Start the agent with `NODE_ENV=development AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true pnpm --filter @magic-resume/agent dev`. A local URL such as `http://127.0.0.1:8080/v1` is an example; use the proxy's actual address. Production intentionally refuses that private destination.
3. Configure the web server with `AI_BACKEND_URL=http://127.0.0.1:4000`. In **Settings → Model**, save the proxy URL, model and key. The connection-test endpoint is M2 work; use an actual chat as the M1 check.
4. Open a fictional resume in AI Lab, select **Optimize**, and supply a short target JD. Expect a skill read, resume read, checklist, field reasons, preview patches and one final proposal. Check that IDs, custom fields and untouched sections survive. The saved document should change only after accepting the review.
5. Repeat without a JD. Expect a `job_info` form and `awaiting_input` from the session endpoint. Stop and restart only the agent, retaining `AGENT_DATA_DIR`; submit the form and confirm continuation. Repeat with a skipped form and verify no invented JD or resume facts appear.
6. Exercise Plan and Ask. Plan must not produce resume mutations. Ask must send no resume snapshot, resume ID or previous resume-derived context to the proxy. Stop an active generation and verify the proxy request is cancelled.
7. Regenerate a second turn and verify the new thread begins after the first turn. Repeat an approval operation and verify HTTP 409. Check a rejected key, a transient provider failure and an idle stream; errors must contain fixed codes rather than provider text or credentials.

Keep real keys out of checked-in fixtures and shell command arguments. Long answers are bounded by idle gaps and the separate whole-run limit. Unsupported `reasoning_effort` is omitted after one explicit rejection; unsupported tools or malformed argument streams still require a capable proxy/model and may produce a partial result rather than a completed rewrite.

## Verification

```sh
pnpm --filter @magic-resume/agent typecheck
pnpm --filter @magic-resume/agent lint
pnpm --filter @magic-resume/agent test
pnpm --filter @magic-resume/agent build
docker build -f apps/agent/Dockerfile -t magic-resume-agent .
```

Tests use a scripted local OpenAI-compatible server, not real provider credentials. They cover each policy and tool, frontend event and card-name contracts, transient errors and cancellation, and all ten HTTP scenarios with MemorySaver and SQLite. The SQLite approval test closes and rebuilds the server against the same real database file.
