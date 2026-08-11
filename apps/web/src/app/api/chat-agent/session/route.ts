import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';

/**
 * Reclaim server-side chat session resources on conversation end / explicit new
 * chat. Best-effort: fired by the client (often with `keepalive`) when it drops a
 * sessionId. This only carries the sessionId, never the user's model key.
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.text();
    const backendResponse = await serverFetchBackend('/api/chat/session', {
      method: 'DELETE',
      body: body || undefined,
      signal: req.signal,
    });

    const data = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: unknown) {
    // 诊断进服务端日志，不进响应体。
    console.error(
      `[AGENT_SESSION] forward failed:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      // 只回码：`errorMessage` 会把 undici 内部与内网 host 泄漏出去。
      { errorCode: 'upstream_unavailable', error: 'upstream_unavailable', retryable: true },
      { status: 500 }
    );
  }
}
