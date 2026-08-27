import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/auth/server';
import { serverFetchBackend } from '@/lib/auth/serverFetchBackend';

// Cap parse time and upload size so a huge/crafted file can't buffer unbounded into
// memory here and get amplified onto the agent backend (DoS). 10 MB comfortably
// covers real resumes.
export const maxDuration = 60;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * 受理的格式。
 *
 * agent-service 的 `pdf.service.ts` 早就支持 `pdf | docx | plain | image` 四类
 * （图片转 data URL 交视觉模型、docx 走 mammoth 抽正文）。**卡住后三类的一直是
 * 这里原来那行「Only PDF files are accepted」的 415**——后端能力在，前端不放行。
 *
 * 仍然保留白名单而不是全放：这条路由把文件原样转发给一个会调模型的后端，
 * 受理面越大，能塞进来的东西越多。
 */
const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'md', 'txt'];
const ACCEPTED_MIME_PREFIXES = ['image/'];
const ACCEPTED_MIME_EXACT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
];

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME_EXACT.includes(file.type)) return true;
  if (ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return true;
  // 扩展名兜底：某些系统对 docx / markdown 报的 MIME 不全，甚至是空串。
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export async function POST(req: NextRequest) {
  try {
    // 验证用户身份 — 未登录直接拒绝
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reject oversized bodies before buffering the whole multipart payload
    // (headroom over MAX_PDF_BYTES for the `config` field + multipart boundaries).
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_PDF_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    // 透传前端的 FormData（file + config）给 agent-service。pass req.signal so a
    // closed dialog / navigation cancels upstream generation promptly.
    const formData = await req.formData();

    // 旧调用方仍会 multipart 直接传文件；输入框的新链路传的是 platform-api
    // 为私有 R2 对象签发的短期 `sourceUrl`。URL 的 R2/SigV4 约束在 agent-service
    // 再做一次强校验，Next 这一层不下载文件，因此不会让 URL 变成 Web 的 SSRF 入口。
    const file = formData.get('file');
    const sourceUrl = formData.get('sourceUrl');
    if (file instanceof File) {
      if (!isAccepted(file)) {
        return NextResponse.json(
          { error: 'Unsupported file type' },
          { status: 415 },
        );
      }
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: 'File too large' }, { status: 413 });
      }
    } else if (typeof sourceUrl !== 'string' || !sourceUrl) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const backendResponse = await serverFetchBackend('/api/pdf/parse', {
      method: 'POST',
      body: formData,
      signal: req.signal,
    });

    const contentType = backendResponse.headers.get('content-type');

    // Success path: agent-service streams parse progress + the final resume as SSE.
    // Forward it line-by-line so the stream reaches the browser unbuffered (mirror
    // of app/api/chat-agent/route.ts).
    if (contentType && contentType.includes('text/event-stream')) {
      if (!backendResponse.body) {
        throw new Error('No response body');
      }

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

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim()) {
                  controller.enqueue(new TextEncoder().encode(line + '\n'));
                }
              }
            }

            if (buffer.trim()) {
              controller.enqueue(new TextEncoder().encode(buffer));
            }
            controller.close();
          } catch (error) {
            // Client/upstream abort (dialog closed) surfaces as AbortError — an
            // expected cancel, not a stream failure.
            if ((error as Error)?.name === 'AbortError') {
              controller.close();
            } else {
              console.error('[PDF_PARSE] Stream error:', error);
              controller.error(error);
            }
          }
        },
        cancel(reason) {
          reader?.cancel(reason).catch(() => {});
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          // no-transform stops any intermediary (nginx/CDN) from gzipping the
          // stream (gzip batches chunks and defeats SSE).
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Disable nginx buffering for THIS stream even if proxy_buffering is on
          // globally (host BaoTa reverse proxy defaults to on).
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Non-stream path: the backend rejected before it started streaming (bad file,
    // over-budget, no LLM config, …) — surface the human-readable message.
    const errorBody = await backendResponse.text();
    if (!backendResponse.ok) {
      console.error(`[PDF_PARSE] Backend error: ${backendResponse.status} ${errorBody}`);
      let message = errorBody;
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed?.message ?? parsed?.error ?? errorBody;
      } catch {
        /* not JSON — use the raw text */
      }
      return new Response(JSON.stringify({ error: message }), {
        status: backendResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Unexpected: a 2xx that isn't SSE. Forward the body as-is rather than guess.
    return new Response(errorBody || '{}', {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[PDF_PARSE_API_ERROR]', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
