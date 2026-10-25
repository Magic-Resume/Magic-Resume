# Resume agent service

A self-hosted, single-user BYOK backend for the local resume editor. It runs a DeepAgents tool loop, streams review proposals and pauses for structured input. Resume acceptance and durable conversation history remain in the browser. Model credentials are required on every chat or approval request and are never stored in checkpoints or application logs.

## Architecture

`http → engine → harness → model`, with shared contracts and persistence as leaf modules:

- `src/http`: Fastify request parsing, JSON session endpoints, and the SSE opening deadline. Configuration and provider failures before model output remain HTTP errors; failures after opening become `error` followed by `done`.
- `src/engine`: per-turn execution, event translation, proposal accumulation, approval validation, session queries, release and regeneration forks.
- `src/harness`: the sole `createDeepAgent` call, native planning, filesystem, skills and delegation; nine ordered policies enforce budgets, retries, recovery, permission modes, skill tool restrictions, read-only skill files, resume validation and fact verification.
- `src/model`: OpenAI-compatible Chat Completions, reasoning deltas, one-time unsupported-effort negotiation, DNS-pinned outbound fetch, redirect rejection and per-connection idle timeouts. Retries occur only before output, for transient failures.
- `src/document`: bounded upload/download readers and cancellable PDF/DOCX extraction workers. Import, snippet editing and connection tests call the model directly without constructing a harness or session.
- `src/attachments`: private disk storage, signed read capabilities, expiry collection and request-local attachment materialization at the model boundary.
- `src/search`: optional REST search adapters using the controlled transport; search counts and citation numbers are shared across root and delegated tasks within a turn.
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
| POST   | `/api/pdf/parse`                | SSE import progress and validated resume proposal      |
| POST   | `/api/agent/edit`               | JSON `{ after, rationale, rationaleDetail? }`          |
| POST   | `/api/chat/edit`                | Compatibility alias for the same snippet handler       |
| POST   | `/api/test-llm`                 | JSON connection result and image capability hint       |

A one-shot chat without `sessionId` has no checkpointer or blocking form/choice tools. When required evidence is missing it asks in text.

## Conversation attachments

Upload multipart `file` to `POST /api/uploads/attachment` for `{ data: { key, filename, contentType } }`, then post `{ key }` to `/api/uploads/attachment/read-url` for `{ data: { url, expiresAt } }`. The editor uses its `/api/backend` proxy and requests a URL only at send time. Chat accepts `{ id, name, contentType, sourceUrl }` attachments, at most **three per turn**. PDF, PNG, JPEG and WebP are accepted, bounded to **10 MiB per file while consuming the stream**. Byte signatures determine the stored type even when extensions or MIME declarations disagree. Files and metadata live privately under random 256-bit keys in `AGENT_DATA_DIR/attachments/`; cleaned display names never determine paths.

`GET /api/uploads/attachment/:key?expires=…&signature=…` verifies an HMAC-SHA256 signature covering origin, path and expiry and returns the file with caching disabled. URLs last up to **15 minutes**, shortened when the file expires sooner. `AGENT_ATTACHMENT_SECRET` optionally supplies a stable secret of at least 32 characters. Otherwise a fresh random secret is generated at startup, invalidating old URLs on restart; existing keys can request new URLs. Neither secrets nor signed URLs are logged.

Chat validates agent-issued URLs and reads directly from disk, with no DNS/HTTP request to itself. Invalid or expired signatures cannot fall back to HTTP. External URLs use the import download policy: public addresses only, pinned DNS, no credentials/fragments/redirects, allowed MIME and bounded declared/actual size. The private-model opt-in never relaxes external document downloads. Downloaded attachments are sniffed and stored under a new key with the same TTL as uploads.

The prompt lists the current names, actual types and page counts. PDF extraction prefers text and falls back to ordered images for scans, preserving import limits (20 text pages, five vision pages, 200,000 text characters and 10 MiB rendered images). Images become image parts in user input. Image rejection returns `model_vision_unsupported`; attachments are never silently dropped. Ask can read files supplied with its question without receiving a resume or earlier resume-derived context.

`read_attachment({ key, page?, offset?, limit? })` reads one 1-based PDF page from a 0-based character offset, default 4,000 and maximum 8,000 characters. Results expose `pageCount`, `totalCharacters`, `nextOffset` and `nextPage`. Image-only files report their mode and provide images instead of claiming to have text. All source content is explicitly untrusted data.

Checkpoint messages retain name/key references and read coordinates. Extracted source text and images are materialized only in request-local memory for model input; the service does not write them into checkpoint messages or workspace source files. Later turns and approvals reopen references; earlier images are loaded on demand with `read_attachment`. Generated answers remain ordinary messages. Expired files return `attachment_expired`, missing/deleted files `attachment_not_found`, bad signatures `attachment_signature_invalid`, and expired URLs `attachment_url_expired`. Refresh an expired URL; re-upload an expired or missing file. Reads enforce `AGENT_ATTACHMENT_TTL_HOURS` (default 24) immediately; startup and periodic sweeps delete expired files. Session release does not delete attachments.

## Optional web search

Without complete search settings there is no `web_search`, no `company-research` / `job-research` in skill discovery or direct reads, and no advertised search capability. Startup logs state enabled/disabled and the provider name without credentials.

Choose one configuration in the agent's private environment file:

```dotenv
# Tavily: also supply your SEARCH_API_KEY through the environment.
SEARCH_PROVIDER=tavily
# Default base: https://api.tavily.com; appends /search.

# Or Brave, also with SEARCH_API_KEY:
# SEARCH_PROVIDER=brave
# Default base: https://api.search.brave.com/res/v1; appends /web/search.

# Or your own SearXNG, with JSON output enabled:
# SEARCH_PROVIDER=searxng
# SEARCH_BASE_URL=http://127.0.0.1:8080
# NODE_ENV=development
# AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true
```

`SEARCH_BASE_URL` can override a provider base and retain a path prefix. SearXNG requires an explicit base and never defaults to a public instance. Search endpoints use controlled DNS-pinned, redirect-blocked transport. Private endpoints require both non-production and `AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true`; production ignores the flag. Responses are capped at 2 MiB with a 30-second request deadline inside the run deadline. Search keys remain in HTTP headers, outside checkpoints and errors.

`web_search({ query, count? })` accepts up to 500 query characters and 1–10 results (default five). Each search consumes the shared tool budget plus `AGENT_MAX_SEARCHES` (default five per turn, shared with delegated tasks, reset on approval). Normalized results contain title, URL, snippet and source site with stable per-turn citation numbers. `source_update` provides frontend-compatible visible external sources tied to the tool lifecycle ID. `tool_result.payload.result.status` reports success, empty results, errors or exhausted budget. Failures do not fabricate sources or prevent an otherwise useful answer.

The two research skills require linked evidence, labelled source statements versus inference, explicit uncertainty and existing `company_research` / `job_research` cards. Company research covers business, scale, recent developments and team/technology signals. Job research scopes responsibilities, skills, terminology and publicly sourced comparable compensation. Search and attachment data cannot grant permission to modify a resume. REST adapters follow the [Tavily search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Brave web search API](https://api-dashboard.search.brave.com/app/documentation/web-search/query) and [SearXNG search API](https://docs.searxng.org/dev/search_api.html).

## Import, snippet editing and connection tests

All three interfaces use the same request-local model credentials and controlled transport as chat. They do not read or create a resume session, save an imported document or persist model configuration. Client disconnection cancels downloads, model requests and document workers.

### Resume import

`POST /api/pdf/parse` retains its historical name for all supported formats. Send multipart `file` and `config` (a JSON string), or `sourceUrl` and the same serialized `config`. JSON `{ "sourceUrl": "https://documents.example.com/resume.pdf", "config": "<serialized config>" }` is also accepted directly by the backend. Supply exactly one source.

- PDF: `pdf-parse@2.4.5` extracts the text layer. Sparse, corrupted or scanned text triggers ordered page images for a vision model. A document with more than 20 pages, or more than five pages when vision is required, fails rather than being truncated.
- DOCX: `mammoth@1.13.0` extracts raw text without HTML conversion or external file access. Empty documents fail explicitly.
- PNG, JPEG and WebP: the original image is sent as image input. A model that rejects image input returns `misconfigured` / `model_vision_unsupported`; use a vision-capable model. Unreadable or empty results are never accepted as an empty resume.
- Markdown and plain text: UTF-8 text is used directly. Invalid encoding, NUL bytes and empty text are rejected.

Each upload or download is limited to **10 MiB while reading its stream**, including chunked bodies. Multipart overhead is limited to 64 KiB; `config` to 32 KiB; source URLs to 8 KiB. Text is capped at 200,000 characters. DOCX archives allow at most 2,048 entries, 10 MiB expanded per entry and 32 MiB expanded total. Rendered PDF images have a combined 10 MiB cap and bounded dimensions. PDF/DOCX work runs in a worker with a 60-second extraction deadline; the configured whole-run deadline still applies. Parsing fails explicitly at these limits.

Source URLs require an allowed document `Content-Type`, public HTTP(S) addresses, DNS pinning and no redirects. Signed query strings are supported; credentials and fragments are rejected. `AGENT_ALLOW_PRIVATE_MODEL_HOSTS` **never permits private document downloads**, including in development. Uploaded files may fall back to a supported extension when their MIME type is empty or `application/octet-stream`; file signatures are checked before binary extraction.

The tool-free `resume-parse` skill receives the document and the public schema. A response must validate against `@magic-resume-kit/resume-schema` and contain extracted content. Invalid output is returned to the model with field-level errors for at most two repairs (three attempts total). No tools, browsing or agent checkpoint are involved.

SSE begins with `run_started`. Progress uses `tool_result.payload` with `kind: "pdf_progress"`, phases `extracting` and `analyzing`, and actual `charCount` / `fields` as output arrives. Image input also includes `mode: "vision"` and `pageCount`. Success is `resume_update.payload.resume` followed by `done`; streaming failures use fixed `error` codes followed by `done`. Input or download rejection before SSE uses an HTTP error instead. The browser validates the proposal before importing it locally.

### Snippet edits

`POST /api/agent/edit` and its compatibility alias `/api/chat/edit` share one handler. Send `{ action, before, resumePath?, selectionText?, instruction?, lang?, locale?, config }`. Supported actions are `polish`, `shorten`, `translate`, `quantify`, `concise`, `verb`, `evidence`, `rewrite`, `tone`, `insert` and `free`.

`before` is the complete field, limited to 100,000 characters. Optional `selectionText` (50,000 characters) must occur in it; `after` still contains the whole field with that selection changed. `instruction` is limited to 10,000 characters. `insert` permits an empty `before` with source facts in `instruction`; translation requires `lang` or a target-language instruction. Rationale text follows `locale`, defaulting to `zh`.

One model invocation returns `{ after, rationale, rationaleDetail? }`. Empty or invalid output fails without another generation. The model receives only the supplied fragment and editing intent, with no document lookup, tools or session. Quantification may clarify existing evidence but cannot invent numbers. Errors use the same fixed vocabulary as chat. As in chat, an explicitly rejected reasoning-effort parameter may cause one transport-level negotiation request; no provider/model substitution occurs.

### Connection tests

`POST /api/test-llm` accepts `{ provider, apiKey, baseUrl, model }` (use `model`, not `modelName`). It tests text first and returns `{ ok: true, latencyMs, supportsImage }`. `latencyMs` measures the text request including connection setup. One tiny image request then checks image capability; a rejection, unreadable answer or five-second image deadline returns `supportsImage: false` while retaining text success. This is a capability hint rather than a guarantee of document readability.

The entire test, including DNS and image probing, has a **28-second deadline** to fit the web proxy's 30-second cap. Text/configuration failures return non-2xx with `{ ok: false, status, message, errorCode, subCode, retryable }`. `message` comes from fixed service text; upstream bodies and credentials never appear in it. The provider label does not select a separate SDK: this service expects an OpenAI-compatible Chat Completions endpoint.

## Configuration

All configuration comes from environment variables; `.env.example` lists the complete set. Model keys, base URLs, names, token limits and reasoning effort are request fields rather than server defaults. Document limits above are fixed service limits, independent of the chat JSON body limit.

| Variable                          | Default              | Meaning                                                                 |
| --------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `HOST` / `PORT`                   | `127.0.0.1` / `4000` | Listen address                                                          |
| `AGENT_DATA_DIR`                  | `./data`             | Directory containing SQLite runtime state and private attachments      |
| `AGENT_SKILLS_DIR`                | packaged `skills/`   | Read-only skill catalog                                                 |
| `AGENT_MAX_MODEL_CALLS`           | `40`                 | Shared root, subagent and assessment budget, including the final answer |
| `AGENT_MAX_TOOL_CALLS`            | `60`                 | Shared tool budget                                                      |
| `AGENT_IDLE_TIMEOUT_MS`           | `120000`             | Maximum gap between upstream bytes, including the first byte            |
| `AGENT_RUN_TIMEOUT_MS`            | `900000`             | Whole HTTP run limit                                                    |
| `AGENT_FIRST_EVENT_WAIT_MS`       | `15000`              | Maximum delay before SSE headers open                                   |
| `AGENT_SESSION_TTL_HOURS`         | `168`                | Expire inactive runtime threads; browser history has its own lifetime   |
| `AGENT_ATTACHMENT_TTL_HOURS`      | `24`                 | Expire conversation files independently of sessions                     |
| `AGENT_ATTACHMENT_SECRET`         | random per startup   | Optional stable HMAC signing secret, minimum 32 characters              |
| `AGENT_MAX_SEARCHES`              | `5`                  | Shared searches per turn, also counted as tools                         |
| `SEARCH_PROVIDER`                 | unset                | Optional `tavily`, `brave` or `searxng`; incomplete settings remove search |
| `SEARCH_API_KEY`                  | unset                | Required for Tavily/Brave; unused for SearXNG                            |
| `SEARCH_BASE_URL`                 | provider default     | Optional base override; required for SearXNG, no public-instance default |
| `AGENT_BODY_LIMIT_BYTES`          | `2097152`            | HTTP JSON body limit                                                    |
| `AGENT_ALLOW_PRIVATE_MODEL_HOSTS` | `false`              | Allow private model/search endpoints only outside production           |

The server logs a fixed warning and ignores private-host opt-in in production. Public outbound model endpoints are DNS-validated once per run and every connection is pinned to the validated address; redirects are rejected. Inherited tracing and verbose provider logging are disabled.

Use one service process per data directory. The database holds temporary messages, resume drafts and tool results, so keep the directory private. Session deletion removes checkpoints, turns and approvals. A background sweep reclaims inactive threads; expiry does not delete the browser's transcript. A claimed approval is consumed once execution may have started, including after cancellation, so an uncertain outcome is inspected through session state rather than replayed automatically.

Docker Compose stores runtime state in the `agent-data` volume and does not publish an agent port. The Alpine image builds `better-sqlite3` with Python, make and a C++ compiler, ships the skill assets, and runs a SQLite saver load/query check as its unprivileged runtime user during the image build. Protect any shared or public deployment at a reverse proxy; the service does not implement multi-user authentication.

## Extend the skill catalog

Add `skills/<name>/SKILL.md` with YAML frontmatter containing `name`, `description` and `allowed-tools`. The name must match its directory. Include goal, appropriate and inappropriate uses, prerequisites, steps, completion criteria, failure handling and output constraints. Put concise supporting material under `references/` or `assets/`.

The five resume conversation skills cover creation, optimization, analysis, fit and translation; `resume-parse` is invoked directly by import with no tools. Complete search configuration enables two additional research skills. DeepAgents discovers available descriptions and reads full bodies on demand. Add a mode mapping in `src/harness/skills/catalog.ts` only when adding an explicit UI entry. User-defined skill IDs are ignored with a fixed warning in this release.

Creation, optimization and translation register 3–5 user-facing todos before work and update them after every completed step. Simple answers and one-step edits do not need a plan. First plans emit both `agent_plan` and `plan_update` for the editor's checklist. Each skill emits `skill_loaded` once per run even when mode activation is followed by reading its file. Shipped references explain evidence, scoring, translation preservation and optional source collection.

`read_file`, `ls`, `glob`, `grep` and `write_todos` are always available to a loaded skill. `read_attachment` is also permitted when attachment references are present. Other tools require an explicit `allowed-tools` declaration. Loading a different skill replaces the previous active permission set; analysis and fit cannot acquire write access from an earlier skill. The mode boundary remains stronger than a skill's declaration.

The Zod widget registry mirrors every frontend card name for compatibility. `push_ui` exposes the supported non-blocking cards only. Forms and choices use native interrupts; unavailable application features are never simulated with cards. Merged card updates are validated as complete cards before publication.

## Smoke test with a real compatible model

1. Start a local OpenAI-compatible proxy that supports streamed Chat Completions and function tools. Record its `/v1` base URL, model name and key. Confirm the proxy is reachable from the agent process.
2. Start the agent with `NODE_ENV=development AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true pnpm --filter @magic-resume/agent dev`. A local URL such as `http://127.0.0.1:8080/v1` is an example; use the proxy's actual address. Production intentionally refuses that private destination.
3. Configure the web server with `AI_BACKEND_URL=http://127.0.0.1:4000`. In **Settings → Model**, enter the proxy URL, model and key, test the connection, then save. Check both text connectivity and the image capability result when importing scans or pictures.
4. Open a fictional resume in Polaris, select **Optimize**, and supply a short target JD. Expect a skill read, resume read, checklist, field reasons, preview patches and one final proposal. Check that IDs, custom fields and untouched sections survive. The saved document should change only after accepting the review.
5. Repeat without a JD. Expect a `job_info` form and `awaiting_input` from the session endpoint. Stop and restart only the agent, retaining `AGENT_DATA_DIR`; submit the form and confirm continuation. Repeat with a skipped form and verify no invented JD or resume facts appear.
6. Exercise Plan and Ask. Plan must not produce resume mutations. Ask must send no resume snapshot, resume ID or previous resume-derived context to the proxy. Stop an active generation and verify the proxy request is cancelled.
7. Regenerate a second turn and verify the new thread begins after the first turn. Repeat an approval operation and verify HTTP 409. Check a rejected key, a transient provider failure and an idle stream; errors must contain fixed codes rather than provider text or credentials.
8. Import the fictional files under `test/fixtures/`: text PDF, scanned PDF, DOCX, PNG/JPEG/WebP, Markdown and text. Scans and images need a vision model. Expect extraction/analysis progress and a valid imported document; cancel once and verify the upstream stops. Text-model image rejection must show a configuration failure, never an empty imported resume.
9. Select a sentence for a quick edit and check that surrounding text survives and the difference requires review. Repeat with an empty/invalid model result or rejected key and verify a fixed error with no saved change.
10. Attach `test/fixtures/resume.pdf` with a question that requires reading its text. Expect `read_attachment` and an answer grounded in the file. Repeat with `attachment-pages.pdf` and ask about the second page, then with a PNG and scanned PDF using a vision model. Repeat in Ask and confirm no resume data is sent. Refresh and ask to reread an attachment; delete or expire one and expect a re-upload request. A text-only model must reject image input explicitly.
11. For real search, prepare a Tavily/Brave API key or a reachable SearXNG instance with JSON output enabled. Set only the chosen provider's variables above and restart only the agent. Ask for a company brief and a role brief with sources; expect search tools, visible source links and the appropriate research card with labelled inference. Confirm links support each claim and unknowns remain explicit. Set `AGENT_MAX_SEARCHES=1` to exercise exhaustion, then remove search configuration and confirm the tool and both skills disappear. Private SearXNG needs the development opt-in; production must reject it even with the flag set.

Keep real keys out of checked-in fixtures and shell command arguments. Long answers are bounded by idle gaps and the separate whole-run limit. Unsupported `reasoning_effort` is omitted after one explicit rejection; unsupported tools or malformed argument streams still require a capable proxy/model and may produce a partial result rather than a completed rewrite.

## Verification

```sh
pnpm --filter @magic-resume/agent typecheck
pnpm --filter @magic-resume/agent lint
pnpm --filter @magic-resume/agent test
pnpm --filter @magic-resume/agent build
docker build -f apps/agent/Dockerfile -t magic-resume-agent .
```

Tests use a scripted local OpenAI-compatible server, not real provider credentials. They cover each policy and tool, frontend event and card-name contracts, transient errors and cancellation, and all ten HTTP scenarios with MemorySaver and SQLite. The SQLite approval test closes and rebuilds the server against the same real database file. Import tests use real document extraction and assert that the model receives the actual text or image payload. Additional checks cover multipart boundaries, streaming size rejection, source policy/pinning, schema repairs, both edit aliases, image probing and the real connection deadline. Committed document fixtures use fictional people and organizations; `test/fixtures/generate.py` can regenerate them with Pillow, reportlab and python-docx, which are not runtime dependencies.

Attachment tests use real PDF extraction, page/character pagination, image requests, signed GETs, chunked upload limits, disk-only reads and TTL collection. Conversation tests inspect SQLite checkpoints and reopen files after server recreation. Search tests call local HTTP services for all three providers, verify private/redirect/size/cancellation rules, shared limits, optional skill removal, research-card pushes and the editor's actual citation normalization.
