import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';
import { projectUpstreamError } from '../errorProjection';

/**
 * Snippet/element-scoped edit — the living canvas' fast, in-place quick actions
 * (优化这段 / 缩短 / 量化 / 换动词 / 新增…). Unlike the whole-resume streaming skills
 * (`/api/chat-agent`), this is a single stateless LLM call: text + action in,
 * `{ after, rationale }` out. The request carries the caller's auth context and
 * model config through the shared API helper; `req.signal` propagates client
 * cancellation so upstream work can stop promptly.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Forward through the shared API helper; the UI never calls this upstream
    // route directly.
    const backendResponse = await serverFetchBackend('/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!backendResponse.ok) {
      // Log the upstream body server-side only; never surface it to the client.
      const errorText = await backendResponse.text();
      console.error(`[AGENT_EDIT] Backend error ${backendResponse.status}: ${errorText}`);
      // 投影而非代理：只放行契约里那五个键，`message` 一律不转发——上游的 4xx 原文
      // 可能是写给运营的英文，甚至说出这个部署配了哪些渠道（见 errorProjection.ts）。
      return NextResponse.json(
        projectUpstreamError(backendResponse.status, errorText),
        { status: backendResponse.status },
      );
    }

    // Non-streaming: a single JSON `{ after, rationale, rationaleDetail? }`.
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    // A client/upstream abort (closed canvas) surfaces as AbortError — expected cancel.
    if ((error as Error)?.name === 'AbortError') {
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    // 诊断进服务端日志，不进响应体。
    console.error(
      `[AGENT_EDIT] forward failed:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      // 只回码：`errorMessage` 会把 undici 内部与内网 host 泄漏出去。
      { errorCode: 'upstream_unavailable', error: 'upstream_unavailable', retryable: true },
      { status: 500 }
    );
  }
}
