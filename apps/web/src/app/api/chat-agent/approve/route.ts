import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';
import { proxySseResponse } from '@/lib/api/streamProxy';
import { projectUpstreamError } from '@/lib/api/errorProjection';

/**
 * Human-in-the-loop tool-approval reply. Forwards the user's decision and proxies
 * the streamed continuation through unchanged, just like the main chat route.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const backendResponse = await serverFetchBackend('/api/chat/approve', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!backendResponse.ok) {
      // Log the upstream body server-side only; never surface it to the client.
      const errorText = await backendResponse.text();
      console.error(
        `[AGENT_APPROVE] Backend error ${backendResponse.status}: ${errorText}`,
      );
      // 投影而非代理：只放行契约里那五个键，`message` 一律不转发——上游的 4xx 原文
      // 可能是写给运营的英文，甚至说出这个部署配了哪些渠道（见 errorProjection.ts）。
      return NextResponse.json(
        projectUpstreamError(backendResponse.status, errorText),
        { status: backendResponse.status },
      );
    }

    const streamResponse = proxySseResponse(backendResponse, '[AGENT_APPROVE]');
    if (streamResponse) return streamResponse;

    // Backend may still answer with JSON (e.g. a 4xx already handled above, or a
    // non-stream edge case) — pass it through.
    const data = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: unknown) {
    // 诊断进服务端日志，不进响应体。
    console.error(
      `[AGENT_APPROVE] forward failed:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      // 只回码：`errorMessage` 会把 undici 内部与内网 host 泄漏出去。
      {
        errorCode: 'upstream_unavailable',
        error: 'upstream_unavailable',
        retryable: true,
      },
      { status: 502 },
    );
  }
}
