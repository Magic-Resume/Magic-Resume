import { setTimeout as delay } from 'node:timers/promises';
import { createMiddleware } from 'langchain';
import { AgentError } from '../../contracts/errors.js';
import { modelError } from '../../model/errors.js';

export const NAME = 'ModelResilience';
export function retryable(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  const normalized = modelError(error, signal);
  if (normalized.payload.errorCode === 'rate_limited') return true;
  if (normalized.payload.errorCode !== 'upstream_unavailable') return false;
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current instanceof AgentError)
      return current.upstreamRetryable === true;
    const value = current as {
      status?: number;
      name?: string;
      code?: string;
      cause?: unknown;
      message?: string;
    };
    if (value.name === 'AbortError' || value.name === 'APIUserAbortError')
      return false;
    if (typeof value.status === 'number') return value.status >= 500;
    if (
      /^(ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|UND_ERR_SOCKET)$/.test(
        value.code ?? '',
      ) ||
      value.name === 'APIConnectionError' ||
      (value.name === 'TypeError' &&
        /fetch failed|network/i.test(value.message ?? ''))
    )
      return true;
    current = value.cause;
  }
  return false;
}
export async function withModelRetry<T>(
  invoke: () => Promise<T>,
  options: {
    signal?: AbortSignal;
    emitted: () => number;
    retries?: number;
    delayMs?: number;
  },
) {
  const initial = options.emitted();
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await invoke();
    } catch (error) {
      if (
        attempt >= (options.retries ?? 1) ||
        options.emitted() !== initial ||
        !retryable(error, options.signal)
      )
        throw error;
      await delay((options.delayMs ?? 200) * 2 ** attempt, undefined, {
        signal: options.signal,
      });
    }
  }
}
export function createModelResilience(emitted: () => number) {
  return createMiddleware({
    name: NAME,
    wrapModelCall: (request, handler) =>
      withModelRetry(() => Promise.resolve(handler(request)), {
        emitted,
        signal: request.runtime.signal,
      }),
  });
}
