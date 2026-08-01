/**
 * Turn an agent SSE `error` event into something a person can act on.
 *
 * The stream carries a machine code in `error` (`agent_run_failed`,
 * `insufficient_quota`, …) and — only when the failure was raised deliberately
 * for a user to read — a sentence in `payload.message`. Throwing `ev.error`
 * straight into a toast is how "agent_run_failed" ended up on screen: it is an
 * identifier for logs and branching, never copy.
 *
 * Order matters. A server-authored message is the most specific thing we have,
 * so it wins; a known code gets localised copy; anything else falls back rather
 * than leaking an identifier we did not anticipate.
 */
export function agentErrorMessage(
  event: { error?: string | null; payload?: unknown },
  translate: (key: string, options?: { defaultValue?: string }) => string,
  fallback: string,
): string {
  const payload = event.payload as { message?: unknown; code?: unknown } | undefined;

  const authored = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (authored) return authored;

  const code =
    (typeof payload?.code === 'string' && payload.code) ||
    (typeof event.error === 'string' && event.error) ||
    '';
  if (!code) return fallback;

  const key = `agentErrors.${code}`;
  const copy = translate(key, { defaultValue: '' });
  // i18next returns the key itself when a namespace is missing, so treat that
  // as "no copy" too — otherwise the user reads `agentErrors.agent_run_failed`,
  // which is worse than the raw code.
  if (copy && copy !== key) return copy;

  return fallback;
}
