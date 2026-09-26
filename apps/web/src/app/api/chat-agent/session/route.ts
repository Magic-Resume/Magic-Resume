import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';

export async function GET(req: NextRequest) {
  try {
    if (!await getServerUserId()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ errorCode: 'session_invalid' }, { status: 400 });
    }
    const backendResponse = await serverFetchBackend(
      `/api/chat/session?sessionId=${encodeURIComponent(sessionId)}`,
      { signal: req.signal },
    );
    return NextResponse.json(
      await backendResponse.json().catch(() => ({})),
      { status: backendResponse.status },
    );
  } catch {
    return NextResponse.json({ errorCode: 'upstream_unavailable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!await getServerUserId()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const backendResponse = await serverFetchBackend('/api/chat/session/fork', {
      method: 'POST',
      body: await req.text(),
      signal: req.signal,
    });
    return NextResponse.json(
      await backendResponse.json().catch(() => ({})),
      { status: backendResponse.status },
    );
  } catch {
    return NextResponse.json({ errorCode: 'upstream_unavailable' }, { status: 502 });
  }
}

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
      {
        errorCode: 'upstream_unavailable',
        error: 'upstream_unavailable',
        retryable: true,
      },
      { status: 500 },
    );
  }
}
