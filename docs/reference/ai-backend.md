# BYOK AI backend contract

The open-source editor stores resumes and one conversation per resume in IndexedDB. AI Lab retains chat, skills, plans, approvals, tools, sources and GenUI cards. It has no accounts, cloud history, memory, interviews or platform billing. This repository supplies the UI and Next.js proxy routes; a compatible AI backend must be deployed separately.

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

All browser requests use same-origin Next.js routes. `lib/ai/backend.ts` is the sole backend-origin reader. No Clerk identity, account token, cloud-sync call or billing entitlement accompanies requests. Protect a shared deployment at the network or reverse-proxy boundary as appropriate; these routes do not implement multi-user authentication. Validate file sizes, source URLs, model base URLs and redirects in the backend, and cancel model work on disconnect.

## HTTP routes

The left column is exposed by this Next.js app. The right column is required on the configured backend.

| Browser route | Backend route | Contract |
|---|---|---|
| `POST /api/chat-agent` | `POST /api/chat` | JSON request, SSE response |
| `POST /api/chat-agent/approve` | `POST /api/chat/approve` | JSON decision, SSE continuation |
| `POST /api/chat-agent/edit` | `POST /api/chat/edit` | JSON snippet edit |
| `GET /api/chat-agent/session?sessionId=…` | `GET /api/chat/session?sessionId=…` | Runtime state; not conversation history |
| `POST /api/chat-agent/session` | `POST /api/chat/session/fork` | Regenerate from a checkpoint |
| `DELETE /api/chat-agent/session` | `DELETE /api/chat/session` | Release runtime state; body `{ "sessionId": "…" }` |
| `POST /api/pdf/parse` | `POST /api/pdf/parse` | Multipart input, SSE parse progress and result |
| `POST /api/test-llm` | `POST /api/test-llm` | Model connection test |
| `/api/backend/api/…` | `/api/…` | JSON or multipart endpoints listed below |

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

The connection test uses `{ provider, apiKey, baseUrl, model }`, with `model` rather than `modelName`. Return `{ ok, latencyMs?, supportsImage?, status?, message? }`; use a non-2xx HTTP status on failure. Next.js caps the test at 30 seconds.

### Conversation and approval

Chat accepts `messages: [{ role, content }]`, `sessionId`, `turnId`, `agentMode`, `mode`, `config`, optional `attachments` and optional resume context. Resume-aware modes send `resumeId` and `currentResume` containing `info`, `sections`, `sectionOrder` and document-language fields. Treat the supplied snapshot as the current local document; a local ID cannot be looked up in a hosted resume database.

`agentMode` sets the permission boundary: `cocreate` can propose changes, `plan` can read but cannot change the resume, and `ask` receives neither resume ID nor snapshot. Do not infer permission from model-generated text. The UI keeps approvals and review controls; generated changes must not bypass user acceptance.

The transcript and session ID survive closing the panel and page reloads. Each resume has one local conversation slot, with no seven-day expiry. Starting a new conversation always asks for confirmation, then replaces that slot; cancelling preserves the current conversation. Saved resume content is unchanged. The backend may maintain ephemeral agent/checkpoint state, but must not require cloud conversation storage.

Session status returns `{ data: { state, checkpointId?, pendingApproval? } }` (a bare inner object is also accepted). `state` is `active`, `awaiting_input`, `checkpoint_missing` or `not_found`. `pendingApproval` contains `requestId`, `interruptId`, `operationId`, `expectedCheckpointId` and `actions: [{ name, args }]`.

Approval requests carry `sessionId`, `interruptId`, `operationId`, `expectedCheckpointId`, `decisions`, the model config and the allowed resume context. A decision is `{ type: "approve" }`, `{ type: "reject", message? }`, or `{ type: "edit", editedAction: { name, args } }`. Return the continued SSE stream. Regeneration posts `{ sourceSessionId, sourceTurnId, expectedCheckpointId, newSessionId }` to the fork endpoint, then replaces the same local conversation slot.

### Snippet edits

`POST /api/chat/edit` accepts `{ action, before, resumePath?, selectionText?, instruction?, lang?, locale, config }`. Return `{ after, rationale, rationaleDetail? }`, either directly or inside `{ data: … }`. `after` must be a non-empty string. The client presents the proposed difference before applying it locally.

### Attachments and resume import

- `POST /api/uploads/attachment`: multipart `file`; return `{ data: { key, filename, contentType } }`.
- `POST /api/uploads/attachment/read-url`: JSON `{ key }`; return `{ data: { url, expiresAt } }`. This short-lived URL is passed to the backend, not stored in the transcript.
- Chat attachments are `{ id, name, contentType, sourceUrl }` entries.
- `POST /api/pdf/parse`: multipart `file` or `sourceUrl`, plus `config` serialized as JSON. Supported files: PDF, DOCX, PNG/JPEG/WebP, Markdown and plain text, up to 10 MiB per uploaded file. Next.js rejects oversized declared request bodies; the backend must enforce its own streaming limits and URL policy.

The importer reads scan progress from `tool_result.payload` with `kind: "pdf_progress"`, `phase`, optional `charCount`, `fields`, `mode: "vision"` and `pageCount`. It reads errors from `error` or `run_failed`. Return the parsed resume in `resume_update.data` or `resume_update.payload.resume`, conforming to `packages/resume-schema`, then close with `done`. The browser validates the result before creating a local resume. For scanning progress, see `ImportResumeDialog.tsx` and `PdfScanProgress.tsx`; the historical `/pdf/parse` name covers all these formats.

### Workspace proposals

Only required when the backend emits `workspace_proposal_ready`:

| Backend route | Body / result |
|---|---|
| `GET /api/resumes/:resumeId/workspace/proposals/:proposalId` | `{ data: WorkspaceProposal }` |
| `POST …/:proposalId/prepare` | `{ changes: WorkspacePreparedChange[] }` → `{ data: WorkspaceProposal }` |
| `POST …/:proposalId/resolve` | `{ accept?: string[], reject?: string[] }` → `{ data: WorkspaceResolution }` |
| `POST …/:proposalId/reject-all` | `{}` → `{ data: WorkspaceProposal }` |

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

Before opening a stream, return an appropriate HTTP error with `{ errorCode, subCode?, params?, requestId?, retryable? }`. After opening it, send an `error` event with the same fields in `payload`. The frontend projects HTTP agent errors to this stable vocabulary and localizes them. Use provider quota/configuration errors to return the user to BYOK configuration; do not send subscription links or billing instructions.

## Verify a backend

Check connection testing, two-turn streaming, cancel, close/reopen and reload persistence, provider quota/configuration failures, and the unconfigured 503 state. Confirm that Ask mode omits resume content. Exercise one supported file import and one approve/reject flow, then reload and verify only accepted changes were saved. Network inspection should show same-origin browser calls and no account, cloud-sync, memory or billing requests.
