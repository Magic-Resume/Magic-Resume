import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';
import { proxySseResponse } from '@/lib/api/streamProxy';
import { projectUpstreamError } from '@/lib/api/errorProjection';

export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Forward the chat request through the shared API helper. Pass req.signal
    // so browser disconnect / modal close can cancel upstream work promptly.
    const backendResponse = await serverFetchBackend('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!backendResponse.ok) {
      // Log the upstream body server-side only; never surface it to the client.
      const errorText = await backendResponse.text();
      console.error(
        `[CHAT_AGENT] Backend error ${backendResponse.status}: ${errorText}`,
      );
      // 投影而非代理：只放行契约里那五个键，`message` 一律不转发——上游的 4xx 原文
      // 可能是写给运营的英文，甚至说出这个部署配了哪些渠道（见 errorProjection.ts）。
      return NextResponse.json(
        projectUpstreamError(backendResponse.status, errorText),
        { status: backendResponse.status },
      );
    }

    const streamResponse = proxySseResponse(backendResponse, '[CHAT_AGENT]');
    if (streamResponse) return streamResponse;

    // 非流式响应 - 直接返回 JSON。
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    // 诊断进服务端日志，不进响应体。
    console.error(
      `[CHAT_AGENT] forward failed:`,
      error instanceof Error ? error.message : error,
    );

    // 只回码。`errorMessage` 装的是 undici 的内部消息与内网 host，而 editClient 的
    // readError 第一个读的就是它——一次转发失败因此把拓扑写到了用户屏幕上。
    return NextResponse.json(
      {
        errorCode: 'upstream_unavailable',
        error: 'upstream_unavailable',
        retryable: true,
      },
      { status: 502 },
    );
  }
}
