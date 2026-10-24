import type { NextRequest } from 'next/server';
import { aiBackendNotConfigured, aiBackendUrl, fetchAiBackend } from '@/lib/ai/backend';

/**
 * Passthrough to the AI backend for its plain JSON endpoints
 * (`httpClient` uses `/api/backend` as its base URL). The streaming agent
 * calls have their own handlers under `app/api/chat-agent`.
 *
 * Only the path, query, method, body and content type cross over. Upstream
 * error bodies are relayed as they are: the backend is the user's own
 * deployment, so there is no operator text to hide from them.
 */
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!aiBackendUrl()) return aiBackendNotConfigured();
  const { path } = await ctx.params;
  const target = `/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  try {
    const upstream = await fetchAiBackend(target, {
      method: req.method,
      headers: { 'Content-Type': req.headers.get('content-type') ?? 'application/json' },
      body: hasBody ? await req.arrayBuffer() : undefined,
      signal: req.signal,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[AI_BACKEND] forward failed:', error instanceof Error ? error.message : error);
    return Response.json(
      { errorCode: 'upstream_unavailable', error: 'upstream_unavailable', retryable: true },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
