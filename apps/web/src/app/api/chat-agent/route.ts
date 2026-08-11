import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';
import { projectUpstreamError } from './errorProjection';

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
            console.error(`[CHAT_AGENT] Backend error ${backendResponse.status}: ${errorText}`);
            // 投影而非代理：只放行契约里那五个键，`message` 一律不转发——上游的 4xx 原文
            // 可能是写给运营的英文，甚至说出这个部署配了哪些渠道（见 errorProjection.ts）。
            return NextResponse.json(
                projectUpstreamError(backendResponse.status, errorText),
                { status: backendResponse.status },
            );
        }

        // 检查响应是否为流式
        const contentType = backendResponse.headers.get('content-type');
        
        if (contentType && contentType.includes('text/event-stream')) {
            // 流式响应 - 手动转发以确保流式行为
            if (!backendResponse.body) {
                throw new Error('No response body');
            }

            // Hoisted so cancel() can tear down the upstream read when the client
            // disconnects (closed modal / stop).
            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
            const readable = new ReadableStream({
                async start(controller) {
                    reader = backendResponse.body!.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            // 解码数据并按行分割
                            const text = decoder.decode(value, { stream: true });
                            buffer += text;

                            // 处理完整的lines
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

                            for (const line of lines) {
                                if (line.trim()) {
                                    // 立即发送每一行
                                    const chunk = new TextEncoder().encode(line + '\n');
                                    controller.enqueue(chunk);
                                }
                            }
                        }

                        // 发送剩余的buffer
                        if (buffer.trim()) {
                            const chunk = new TextEncoder().encode(buffer);
                            controller.enqueue(chunk);
                        }
                        controller.close();
                    } catch (error) {
                        // A client/upstream abort surfaces as AbortError once req.signal
                        // fires — that's an expected cancel, not a stream failure.
                        if ((error as Error)?.name === 'AbortError') {
                            controller.close();
                        } else {
                            console.error('Stream error:', error);
                            controller.error(error);
                        }
                    }
                },
                cancel(reason) {
                    // Consumer (browser) cancelled: release the upstream read so
                    // the request can abort promptly.
                    reader?.cancel(reason).catch(() => {});
                },
            });

            return new Response(readable, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    // no-transform stops any intermediary (nginx/CDN) from gzipping
                    // the stream (gzip batches chunks and defeats SSE).
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    // Tell nginx to disable response buffering for THIS stream even
                    // if proxy_buffering is on globally (host BaoTa reverse proxy
                    // defaults to on) — code-level safety net so streaming survives
                    // an nginx config reset.
                    'X-Accel-Buffering': 'no',
                },
            });
        } else {
            // 非流式响应 - 直接返回JSON
            const data = await backendResponse.json();
            return NextResponse.json(data);
        }

    } catch (error: unknown) {
        // 诊断进服务端日志，不进响应体。
        console.error(
          `[CHAT_AGENT] forward failed:`,
          error instanceof Error ? error.message : error,
        );
        
        // 只回码。`errorMessage` 装的是 undici 的内部消息与内网 host，而 editClient 的
        // readError 第一个读的就是它——一次转发失败因此把拓扑写到了用户屏幕上。
        return NextResponse.json(
            { errorCode: 'upstream_unavailable', error: 'upstream_unavailable', retryable: true },
            { status: 502 }
        );
    }
}
