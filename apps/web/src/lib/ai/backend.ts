import { NextResponse } from 'next/server';

/**
 * The one place the web app learns where its AI backend lives.
 *
 * The editor itself is local-only. AI Lab talks to a separate backend that runs
 * the agent with the user's own model key (bring-your-own-key); the browser
 * never calls it directly. Every AI route handler under `app/api/chat-agent`
 * and the `/api/backend/*` passthrough forwards through here, so pointing the
 * app at a backend is one server-side variable, read per request: the same
 * image works with or without one, and changing it needs no rebuild.
 *
 * The request and event contract the backend has to implement is documented in
 * `docs/reference/ai-backend.md`.
 */
export function aiBackendUrl(): string | null {
  const raw = process.env.AI_BACKEND_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

/**
 * The response for "no backend configured". A 503 with a stable code, so the
 * client can say what is missing instead of reporting a generic failure.
 */
export function aiBackendNotConfigured(): NextResponse {
  return NextResponse.json(
    {
      errorCode: 'misconfigured',
      subCode: 'ai_backend_not_configured',
      error: 'misconfigured',
      retryable: false,
    },
    { status: 503 },
  );
}

/**
 * `fetch` against the AI backend. Bodies (JSON, SSE, multipart) pass through
 * untouched; only a default JSON `Content-Type` is added, skipped for
 * `FormData`. Callers check {@link aiBackendUrl} first and answer with
 * {@link aiBackendNotConfigured} when it is unset.
 */
export async function fetchAiBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const base = aiBackendUrl();
  if (!base) throw new Error('AI_BACKEND_URL is not set');

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${base}${path}`, { ...init, headers, cache: 'no-store' });
}
