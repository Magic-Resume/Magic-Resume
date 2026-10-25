# BYOK text chat service

A self-hosted Fastify service for the editor's AI Lab. M0 implements `GET /health`
and `POST /api/chat`: streaming, multi-turn text chat through the model selected by
the user. It uses Deep Agents on LangGraph with the built-in tool and summarization
middleware disabled, and the OpenAI-compatible Chat Completions adapter from
`@langchain/openai`.

## Local development

From the repository root, using Node **22.22.2** and pnpm **10.28.1**:

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm install
cp apps/agent/.env.example apps/agent/.env
pnpm --filter @magic-resume/agent dev
```

The default listener is `http://127.0.0.1:4000`. `curl http://127.0.0.1:4000/health`
returns `{"ok":true}`. For a compiled run:

```bash
pnpm --filter @magic-resume/agent build
pnpm --filter @magic-resume/agent start
```

Both scripts read `apps/agent/.env` if it exists. Request keys never belong in that
file: each request supplies `config.apiKey`, `baseUrl` and `modelName`.

## Environment variables

| Variable                          | Default       | Meaning                                                                                       |
| --------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `development` | `production` always enforces public model hosts.                                              |
| `HOST`                            | `127.0.0.1`   | Listener address; containers use `0.0.0.0`.                                                   |
| `PORT`                            | `4000`        | HTTP listener port.                                                                           |
| `AGENT_MODEL_TIMEOUT_MS`          | `120000`      | Total per-turn deadline, including DNS and streaming.                                         |
| `AGENT_BODY_LIMIT_BYTES`          | `2097152`     | Maximum JSON request size in bytes.                                                           |
| `AGENT_ALLOW_PRIVATE_MODEL_HOSTS` | `false`       | Set to `true` only for local model development. Ignored in production with a startup warning. |

Model URLs must use HTTP or HTTPS without credentials, query strings or fragments.
Each turn checks every DNS answer, rejects non-public destinations and pins the
approved address for its connections. The original hostname remains in HTTP Host
and TLS certificate verification. Redirects are always rejected. The development
flag permits private addresses but keeps DNS pinning and redirect protection.

## Connect the editor

Add this server-only setting to `apps/web/.env.local` and restart the editor:

```dotenv
AI_BACKEND_URL=http://127.0.0.1:4000
```

Do not append `/api` and do not expose this variable through a `NEXT_PUBLIC_`
setting. In **Settings → Model**, save the user's OpenAI-compatible Base URL
(typically ending in `/v1`), API key and model name. Chat requests carry these
settings to the service through the editor's existing Next.js proxy.

The separate model-connection test route is not implemented in M0; its test
button will not succeed against this milestone. Save the settings to exercise
text chat. All other routes in the [full backend contract](../../docs/reference/ai-backend.md)
are deferred to later milestones.

`cocreate` and `plan` include the supplied resume as read-only JSON context.
`ask` ignores both the resume snapshot and resume ID, even if supplied. No mode
modifies a resume in M0. Each request must contain the full `messages` history;
session and turn IDs are accepted but do not create server-side session state.
Attachments, skills and the other optional context fields are accepted but unused.

Each SSE frame is a single `data:` JSON line, with `protocolVersion: 1` and a
consecutive `streamSequence` starting at 1. Streams contain `run_started`, text
`message_chunk` events, optional `reasoning_chunk` events, and `done`. The first
provider read occurs before SSE headers so initial provider failures can return
HTTP JSON. Later failures emit `error` with the same fields in `payload` and close
the stream. Cancelling the browser request aborts the provider request as well.

The optional `effort` becomes `reasoning_effort`. If the provider explicitly
rejects that parameter before any text or reasoning is emitted, the service
retries once without it. It does not retry other provider errors or change models.

| Failure                                      | `errorCode`            | Example `subCode`                                                  |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| Missing or invalid model settings            | `misconfigured`        | `model_config_invalid`                                             |
| Private host, DNS failure or redirect        | `misconfigured`        | `model_host_blocked`, `model_dns_failed`, `model_redirect_blocked` |
| Invalid key                                  | `unauthenticated`      | `model_key_invalid`                                                |
| Provider quota exhausted                     | `quota_exceeded`       | `model_quota_exceeded`                                             |
| Selected model requires more provider access | `plan_required`        | `model_access_required`                                            |
| Invalid endpoint or model name               | `misconfigured`        | `model_endpoint_or_name_invalid`                                   |
| Rate limit                                   | `rate_limited`         | `model_rate_limited`                                               |
| Deadline exceeded                            | `upstream_unavailable` | `model_timeout`                                                    |

Only fixed codes and retry flags are returned; provider error text is never sent
to the client. The editor opens model configuration for `quota_exceeded` and
`plan_required`.

## Verify with a local fake model

In one terminal:

```bash
cd apps/agent
node --import tsx test/fake-model.ts
```

In another terminal, from the repository root:

```bash
NODE_ENV=development AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true pnpm --filter @magic-resume/agent dev
```

Then send a request with a deliberately fictional key:

```bash
curl -N -X POST localhost:4000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hello"}],"agentMode":"ask","config":{"source":"byok","apiKey":"example-test-key","baseUrl":"http://127.0.0.1:4100/v1","modelName":"reasoning","effort":"medium"}}'
```

The result starts with `run_started`, then reasoning and text deltas, then `done`.
Use the fixture model `slow` and stop curl with Ctrl-C to exercise cancellation.
`error-401`, `error-402`, `error-429` and `unsupported-effort` exercise the error
mapping and the one-time compatibility retry.

```bash
pnpm --filter @magic-resume/agent typecheck
pnpm --filter @magic-resume/agent lint
pnpm --filter @magic-resume/agent test
pnpm --filter @magic-resume/agent build
```

Tests use Node's built-in runner (`node --import tsx --test`) and a local fake
OpenAI-compatible server; they need no provider key or external model connection.

## Docker and public deployment

From the repository root:

```bash
docker compose up --build
```

Open `http://127.0.0.1:3000`. The web container uses
`AI_BACKEND_URL=http://agent:4000`; the agent listens on the container network with
no host port mapping. Both containers run in production mode, so model endpoints
must resolve to public addresses. Resumes and conversations stay in browser
storage; this service has no database or volume.

The service has no authentication. Before making it publicly reachable, protect
both the editor's AI proxy routes and the agent at your reverse proxy or network
boundary. Use HTTPS, appropriate access controls and request/rate limits, and turn
off request-body and authorization logging there. Turn off proxy buffering and
allow sufficient time for SSE. The model key is kept only in request memory and
sent to the chosen provider; never capture bodies or credentials in access logs,
error reporting or traces.

The service disables framework tracing and verbose model logging, including
inherited tracing flags. Provider HTTP debug logging is also disabled.
