---
title: BYOK AI backend contract
type: reference
status: Living
owner: kaihuang
created: 2026-10-25
updated: 2026-10-25
summary: What a self-hosted AI backend must implement for Polaris, the AI assistant — the AI_BACKEND_URL entry, proxied routes, request config and stream events.
scope: [apps/web, AI_BACKEND_URL]
repos: [Magic-Resume]
related: [reference/public-packages-integration]
---

# BYOK AI backend contract

The open-source editor stores resumes and one conversation per resume in IndexedDB. Polaris, the AI assistant, retains chat, skills, plans, approvals, tools, sources and GenUI cards. It has no accounts, cloud history, memory, interviews or platform billing. This repository supplies the UI and Next.js proxy routes; a compatible AI backend must be deployed separately.

## Configure the application

Set a server-only origin in `apps/web/.env.local`, then restart the Next.js server:

```dotenv
AI_BACKEND_URL=http://localhost:4000
```

Do not append `/api`. In Docker, use an address reachable from the web container, such as `http://ai-backend:4000`; `localhost` refers to that container. Pass the variable at runtime, for example `docker run -e AI_BACKEND_URL=http://ai-backend:4000 ...`. It is read per request and does not need to be embedded in the browser bundle.

Open **Settings → Model**, select a provider, enter your key and model, test the connection, and save. An ordinary OpenAI-compatible `/v1` endpoint is the model's **Base URL**, not `AI_BACKEND_URL`: the AI backend must also implement the agent and file protocols below.

Without a backend, editing, JSON import and PDF/PNG/JSON export remain available. AI routes return HTTP 503 with `errorCode: "misconfigured"` and `subCode: "ai_backend_not_configured"`.

## Data boundary

Model settings are stored in the current browser; the API key is encrypted at rest using a browser-held key. This protects the stored representation, not against scripts running in the same origin. Using AI sends the model key, messages, selected attachments and, in resume-aware modes, the current resume snapshot to the configured backend. The backend then calls the user's provider. Do not log or persist raw keys.

All browser requests use same-origin Next.js routes. `lib/ai/backend.ts` is the sole backend-origin reader. No account identity or token, cloud-sync call or billing entitlement accompanies requests. Protect a shared deployment at the network or reverse-proxy boundary as appropriate; these routes do not implement multi-user authentication. Validate file sizes, source URLs, model base URLs and redirects in the backend, and cancel model work on disconnect.

## HTTP routes

The left column is exposed by this Next.js app. The right column is required on the configured backend.

| Browser route                             | Backend route                       | Contract                                                     |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `POST /api/chat-agent`                    | `POST /api/chat`                    | JSON request, SSE response                                   |
| `POST /api/chat-agent/approve`            | `POST /api/chat/approve`            | JSON decision, SSE continuation                              |
| `POST /api/chat-agent/edit`               | `POST /api/agent/edit`              | JSON snippet edit; `/api/chat/edit` is a compatibility alias |
| `GET /api/chat-agent/session?sessionId=…` | `GET /api/chat/session?sessionId=…` | Runtime state; not conversation history                      |
| `POST /api/chat-agent/session`            | `POST /api/chat/session/fork`       | Regenerate from a checkpoint                                 |
| `DELETE /api/chat-agent/session`          | `DELETE /api/chat/session`          | Release runtime state; body `{ "sessionId": "…" }`           |
| `POST /api/pdf/parse`                     | `POST /api/pdf/parse`               | Multipart input, SSE parse progress and result               |
| `POST /api/test-llm`                      | `POST /api/test-llm`                | Model connection test                                        |
| `/api/backend/api/…`                      | `/api/…`                            | JSON or multipart endpoints listed below                     |

The general proxy forwards the method, path, query, body and content type. It does not forward browser cookies or authorization headers. The dedicated agent routes preserve streaming and cancellation signals.

### Model configuration

Every chat, approval, snippet edit and AI import carries this `config` object:

```json
{
  "source": "byok",
  "apiKey": "user-supplied-key",
  "baseUrl": "https://api.example.com/v1",
  "modelName": "user-selected-model",
  "maxTokens": 16384,
  "effort": "medium"
}
```

`effort` is `low`, `medium` or `high`. Adapt or omit unsupported provider parameters rather than assuming every model supports reasoning. No platform fallback is requested. Provider quota or authentication failures must be returned to the client; do not silently switch to a paid platform model.

The connection test uses `{ provider, apiKey, baseUrl, model }`, with `model` rather than `modelName`. Return `{ ok, latencyMs?, supportsImage?, status?, message? }`; use a non-2xx HTTP status on failure. Next.js caps the test at 30 seconds. The supplied service uses the same DNS-pinned, redirect-blocking model transport, with a 28-second total deadline. After a successful text request it makes one tiny image request; an unsuccessful image probe returns `supportsImage: false` without changing `ok: true`. This is a capability hint, not a guarantee that every document can be read. Messages are fixed service text and never include upstream error bodies.

### Conversation and approval

Chat accepts `messages: [{ role, content }]`, `sessionId`, `turnId`, `agentMode`, `mode`, `config`, optional `attachments` and optional resume context. Resume-aware modes send `resumeId` and `currentResume` containing `info`, `sections`, `sectionOrder` and document-language fields. Treat the supplied snapshot as the current local document; a local ID cannot be looked up in a hosted resume database.

`agentMode` sets the permission boundary: `cocreate` can propose changes, `plan` can read but cannot change the resume, and `ask` receives neither resume ID nor snapshot. Do not infer permission from model-generated text. The UI keeps approvals and review controls; generated changes must not bypass user acceptance.

The transcript and session ID survive closing the panel and page reloads. Each resume has one local conversation slot, with no seven-day expiry. Starting a new conversation always asks for confirmation, then replaces that slot; cancelling preserves the current conversation. Saved resume content is unchanged. The backend may maintain ephemeral agent/checkpoint state, but must not require cloud conversation storage.

Session status returns `{ data: { state, checkpointId?, pendingApproval? } }` (a bare inner object is also accepted). `state` is `active`, `awaiting_input`, `checkpoint_missing` or `not_found`. `pendingApproval` contains `requestId`, `interruptId`, `operationId`, `expectedCheckpointId` and `actions: [{ name, args }]`.

Approval requests carry `sessionId`, `interruptId`, `operationId`, `expectedCheckpointId`, `decisions`, the model config and the allowed resume context. A decision is `{ type: "approve" }`, `{ type: "reject", message? }`, or `{ type: "edit", editedAction: { name, args } }`. Return the continued SSE stream. Regeneration posts `{ sourceSessionId, sourceTurnId, expectedCheckpointId, newSessionId }` to the fork endpoint, then replaces the same local conversation slot.

### Snippet edits

`POST /api/agent/edit` is the primary endpoint used by the Next.js proxy. `POST /api/chat/edit` is a compatibility alias to the same handler. Both accept `{ action, before, resumePath?, selectionText?, instruction?, lang?, locale, config }`. Return `{ after, rationale, rationaleDetail? }`, either directly or inside `{ data: … }`. `after` must be a non-empty string. The client presents the proposed difference before applying it locally.

Actions are `polish`, `shorten`, `translate`, `quantify`, `concise`, `verb`, `evidence`, `rewrite`, `tone`, `insert` and `free`. `before` is the whole field (up to 100,000 characters); `selectionText`, when supplied, identifies the substring to change, and `after` still contains the whole field. `insert` may have an empty `before` but needs source facts in `instruction`. Translation needs `lang` or an instruction specifying the target. `locale` controls the rationale language and defaults to `zh`. The service makes one model invocation, with no resume lookup, tools, checkpoint or session. It validates the result without a model repair loop and uses the conversation error vocabulary on failure.

### Attachments and resume import

- `POST /api/uploads/attachment`: multipart `file`; return `{ data: { key, filename, contentType } }`.
- `POST /api/uploads/attachment/read-url`: JSON `{ key }`; return `{ data: { url, expiresAt } }`. This short-lived URL is passed to the backend, not stored in the transcript.
- Chat attachments are `{ id, name, contentType, sourceUrl }` entries.
- `POST /api/pdf/parse`: multipart `file` or `sourceUrl`, plus `config` serialized as JSON. The backend also accepts JSON `{ sourceUrl, config: "<serialized model configuration>" }`. Supply exactly one source. Supported files: PDF, DOCX, PNG/JPEG/WebP, UTF-8 Markdown and plain text, up to 10 MiB per uploaded or downloaded file. Next.js rejects oversized declared request bodies; the backend enforces its own limits while consuming the stream, including requests without `Content-Length`.

Conversation uploads accept **PDF, PNG, JPEG and WebP only**, with at most three attachments per turn and 10 MiB per file. The upload stream enforces this byte limit; the stored type is sniffed from the bytes even when a filename or declared MIME type disagrees. Files and private metadata live in `AGENT_DATA_DIR/attachments/`, under unpredictable random keys; cleaned display filenames never determine storage paths. Files expire after `AGENT_ATTACHMENT_TTL_HOURS` (default 24 hours), with checks on reads and a startup/background deletion sweep. Releasing a conversation does not delete its attachments.

Read URLs have the form `http(s)://<agent-origin>/api/uploads/attachment/<key>?expires=<unix-seconds>&signature=<base64url-HMAC-SHA256>`. `GET` on this route validates the signature and expiry before returning the file with `Cache-Control: private, no-store`. The HMAC covers the origin, path and expiry. Default validity is 15 minutes, shortened when the file expires sooner. `AGENT_ATTACHMENT_SECRET` supplies a secret of at least 32 characters; otherwise a fresh process-local random secret is generated at startup. A restart then invalidates old URLs, while stored keys can obtain new ones. Neither secret nor signed URL is logged. These are bearer read capabilities; protect the unauthenticated service at the deployment boundary.

The browser requests a read URL only when sending. Chat recognizes this reserved read path, validates its signature and reads the file **directly from disk**, even when the URL uses an internal agent origin. It never makes an HTTP request to its own read route; an invalid or expired signature cannot fall back to a network download. External attachment URLs use the same bounded, DNS-pinned download path as imports, followed by byte sniffing and local storage under a fresh key. Invalid/expired URLs return `attachment_signature_invalid` / `attachment_url_expired`; expired files return `attachment_expired`, and missing/deleted files return `attachment_not_found`. Re-upload a missing file; request a fresh URL when only the URL expired.

The per-turn system prompt lists attachment names, actual types and page counts. Text-layer PDFs are available through `read_attachment({ key, page?, offset?, limit? })`: PDF pages are 1-based, character offsets 0-based, the default limit is 4,000 characters and the maximum is 8,000 per call. Results include `pageCount`, `totalCharacters`, `nextOffset` and `nextPage`; a page is never silently truncated without a continuation. Scans use the import extractor's ordered page images, and PNG/JPEG/WebP become image parts in user input. Image rejection returns `misconfigured` / `model_vision_unsupported`; files are never silently dropped. Attachment text and images are untrusted data, not instructions. Ask can read attachments supplied with its current question while retaining no resume access.

Checkpoint messages retain only attachment name/key references and read coordinates, not signed URLs, image bytes or extracted source text. Text tool results are materialized only for the model request; later turns and approval continuations reopen referenced files as needed. Earlier missing files appear as unavailable and the read tool explicitly asks for re-upload. Generated answers remain ordinary conversation messages.

External source URLs must resolve entirely to public HTTP(S) addresses. DNS is resolved once and connections use the fixed address; credentials, fragments and redirects are forbidden, while signed query strings are retained. A development opt-in for private model endpoints never enables private document downloads. Downloads require an allowed document MIME type and are bounded by both declared and actual size. Import file/model input remains in request memory, with no imported-document storage or session creation; conversation attachments have the separate disk lifetime described above.

The supplied service extracts PDF text with `pdf-parse` v2 and DOCX text with `mammoth`. PDF text extraction is limited to 20 pages. Sparse or unreadable PDF text triggers rendering of all pages, limited to five; larger scanned documents fail explicitly rather than being partially imported. Direct images use image input. Text is limited to 200,000 characters, DOCX expanded archives to 32 MiB (10 MiB per entry), and rendered page images to 10 MiB combined. Document workers have a 60-second extraction deadline and can be terminated on cancellation. Resume parsing uses the `resume-parse` skill in a tool-free model request; schema errors permit at most two repair requests. Unsupported image input returns `misconfigured` / `model_vision_unsupported`, and an empty or invalid resume is never returned as a successful import.

The importer reads scan progress from `tool_result.payload` with `kind: "pdf_progress"`, `phase`, optional `charCount`, `fields`, `mode: "vision"` and `pageCount`. It reads errors from `error` or `run_failed`. Return the parsed resume in `resume_update.data` or `resume_update.payload.resume`, conforming to `@magic-resume-kit/resume-schema`, then close with `done`. The browser validates the result before creating a local resume. For scanning progress, see `ImportResumeDialog.tsx` and `PdfScanProgress.tsx`; the historical `/pdf/parse` name covers all these formats.

### Optional web search

Search is optional and configured on the agent, independently of the browser's model key. Set `SEARCH_PROVIDER=tavily` or `brave` with `SEARCH_API_KEY`, or `SEARCH_PROVIDER=searxng` with an explicit `SEARCH_BASE_URL` (no default public instance). Absent, invalid or incomplete configuration removes `web_search`, `company-research` and `job-research` from the harness, skill discovery and direct skill reads. The system prompt does not advertise search. Startup logs state whether search is enabled without printing credentials.

`web_search({ query, count? })` accepts up to 500 query characters and 1–10 results (default 5). Searches count toward the shared tool budget and the separate `AGENT_MAX_SEARCHES` budget (default five per turn, including delegated tasks); approval continuation starts a fresh budget. Responses normalize titles, links, snippets and source sites. The mapper emits `source_update.payload: { toolCallId, sources }` with stable per-turn citation numbers and sources shaped as `{ id, kind: "external", visibility: "visible", citationId, title, url, snippet, sourceName, publishedDate? }`. `toolCallId` matches the displayed tool lifecycle. `tool_result.payload.result` also carries `status` and `results`, including explicit empty, error and budget-exhausted outcomes.

Search uses controlled, DNS-pinned HTTP transport with no redirects, a 2 MiB response cap and a 30-second request deadline within the run deadline. Custom service base URLs, including a private SearXNG instance, follow the model private-host rule: only non-production plus explicit `AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true` permits a private destination. Production ignores the opt-in. This does not relax external attachment download rules. Search keys stay in HTTP headers and never enter graph state or errors. Search snippets are data; the research skills require source links for conclusions, labelled inference, explicit uncertainty, and existing `company_research` / `job_research` cards. Search failure is reported without fabricated sources.

### Workspace proposals

Only required when the backend emits `workspace_proposal_ready`:

| Backend route                                                | Body / result                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /api/resumes/:resumeId/workspace/proposals/:proposalId` | `{ data: WorkspaceProposal }`                                                |
| `POST …/:proposalId/prepare`                                 | `{ changes: WorkspacePreparedChange[] }` → `{ data: WorkspaceProposal }`     |
| `POST …/:proposalId/resolve`                                 | `{ accept?: string[], reject?: string[] }` → `{ data: WorkspaceResolution }` |
| `POST …/:proposalId/reject-all`                              | `{}` → `{ data: WorkspaceProposal }`                                         |

The precise target, hash, proposal and resolution types are in `apps/web/src/lib/api/workspace.ts`. A proposal carries its base and candidate snapshots. The backend validates decisions against that proposal and returns the resolved document and revision; the browser stores accepted results in IndexedDB. This protocol does not require an account or cloud synchronization.

## Streaming events

Use `Content-Type: text/event-stream`, disable proxy buffering, and send one JSON object per `data:` line followed by a blank line. All v1 events have `protocolVersion: 1` and a consecutive `streamSequence` starting at 1 for each HTTP response. A gap or unsupported version is rejected. The legacy format without `protocolVersion` is also accepted.

A minimal text response is:

```text
data: {"protocolVersion":1,"streamSequence":1,"type":"message_chunk","content":"Hello"}

data: {"protocolVersion":1,"streamSequence":2,"type":"done"}

```

Additional event families supported by the retained UI:

- Lifecycle: `run_started`, `step_started`, `llm_started`, `llm_usage`, `step_completed`, `run_completed`, `run_cancelled`, `run_failed`, `done`, `error`.
- Progress: `agent_plan`, `plan_update`, `skill_loaded`, `subagent_started`, `subagent_completed`, `reasoning_chunk`.
- Tools and sources: `tool_started`, `tool_result`, `tool_completed`, `tool_approval_request`, `source_update`.
- Cards: `ui_widget`; widget names and payloads must match the registry in `ai/widgets/registry.ts` and `packages/genui/src/contract`.
- Resume results: `resume_patch`, `resume_update`, `workspace_proposal_ready`, `resume_analysis`, `fit_report`, `resume_verification`, `resume_change_notes`, `resume_write_failed`, `resume_sync_failed`, `translation_result`, `pdf_result`.

Use the discriminated event types in `ai/lib/services/types.ts` and consumers in `AiChatShell.tsx` as the payload reference. For example, a final snapshot is `{ type: "resume_update", payload: { resume, final: true, mutation: { kind: "snapshot", authoritative: true, final: true, resume } } }`. A JSON patch-style event is a proposal, not permission to replace an entire document. Do not emit interview or memory flows into this edition.

The following additive fields reflect the actual editor consumers:

- `tool_approval_request.payload` includes `requestId`, `interruptId`, `operationId`, `expectedCheckpointId`, `toolName`, `reason`, `args` and `actions`. Preserve the three continuation identifiers unchanged when submitting the decision; they bind the answer to the pending interrupt and checkpoint.
- The first successful `write_todos` emits both `agent_plan` and `plan_update` with the same `{ todos: [{ content, status }] }` payload. The visible checklist consumes `plan_update`; subsequent changes emit `plan_update` only. Statuses are `pending`, `in_progress` or `completed`. A skill emits `skill_loaded` once per run, including when explicit mode activation is followed by a read of its `SKILL.md`.
- `resume_patch.payload.patch` is an RFC 6902 JSON Patch array with JSON Pointer paths, for example `[{ "op": "replace", "path": "/info/headline", "value": "Frontend Engineer" }]`. Apply it to the current preview in stream order; it does not authorize a saved-document write. The payload also retains `path`, optional `oldString` / `newString`, and the non-authoritative `mutation` envelope for compatibility. The final `resume_update` supplies the complete validated proposal.

Before opening a stream, return an appropriate HTTP error with `{ errorCode, subCode?, params?, requestId?, retryable? }`. After opening it, send an `error` event with the same fields in `payload`. The frontend projects HTTP agent errors to this stable vocabulary and localizes them. Use provider quota/configuration errors to return the user to BYOK configuration; do not send subscription links or billing instructions. The editor reopens model settings for `quota_exceeded`, `plan_required`, `unauthenticated` (the provider rejected the key), `forbidden` (the key cannot use the model) and `misconfigured` with a `model_` subCode (for example `model_config_invalid` or `model_host_blocked`).

## Verify a backend

Check connection testing, two-turn streaming, cancel, close/reopen and reload persistence, provider quota/configuration failures, and the unconfigured 503 state. Confirm that Ask mode omits resume content. Exercise one supported file import and one approve/reject flow, then reload and verify only accepted changes were saved. Network inspection should show same-origin browser calls and no account, cloud-sync, memory or billing requests.
