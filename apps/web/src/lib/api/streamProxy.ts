const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  // Prevent intermediary compression/buffering from batching SSE frames.
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Forward an upstream SSE response without buffering it in the Next route.
 * Returns null for non-stream responses so the caller can project JSON normally.
 */
export function proxySseResponse(
  upstream: Response,
  label = 'SSE',
): Response | null {
  const contentType = upstream.headers.get('content-type');
  if (!contentType?.includes('text/event-stream')) return null;
  if (!upstream.body) throw new Error('No response body');

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = upstream.body!.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Keep the upstream bytes intact. In particular, blank lines are
          // meaningful SSE frame delimiters and must not be filtered out.
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        // A client/upstream abort is expected when a modal closes or navigation
        // cancels the request; do not turn it into a visible stream error.
        if ((error as Error)?.name === 'AbortError') {
          controller.close();
        } else {
          console.error(`${label} stream error:`, error);
          controller.error(error);
        }
      }
    },
    cancel(reason) {
      reader?.cancel(reason).catch(() => {});
    },
  });

  return new Response(readable, { headers: SSE_HEADERS });
}
