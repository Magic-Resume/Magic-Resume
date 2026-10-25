import { once } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { ErrorPayload } from './errors.js';

export type ChatEvent =
  | { type: 'run_started' | 'done' }
  | { type: 'message_chunk' | 'reasoning_chunk'; content: string }
  | { type: 'error'; payload: ErrorPayload };

export function createEventEncoder(runId: string) {
  let sequence = 0;
  return (event: ChatEvent): string =>
    `data: ${JSON.stringify({
      ...event,
      runId,
      protocolVersion: 1,
      streamSequence: ++sequence,
    })}\n\n`;
}

export function openEventStream(
  response: ServerResponse,
  runId: string,
  signal: AbortSignal,
) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  const encode = createEventEncoder(runId);
  return async (event: ChatEvent) => {
    signal.throwIfAborted();
    if (!response.write(encode(event))) {
      await once(response, 'drain', { signal });
    }
  };
}
