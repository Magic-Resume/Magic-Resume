/**
 * Map a /api/test-llm probe failure into a stable "kind" so the UI can show
 * localised, actionable copy instead of the provider's raw error string
 * (e.g. `Upstream 'agent' unavailable`, which means nothing to most users).
 *
 * Order matters: explicit auth/quota/rate-limit signals beat the HTTP status,
 * because gateways often wrap those behind a 503 or a 200-with-error-body.
 */
export type LlmTestErrorKind =
  | 'upstream'
  | 'auth'
  | 'quota'
  | 'rateLimit'
  | 'notFound'
  | 'server'
  | 'timeout';

const KIND_PATTERNS: Array<[LlmTestErrorKind, RegExp]> = [
  ['timeout', /timeout|timed out|ETIMEDOUT|abort/i],
  ['upstream', /upstream|origin|gateway|backend.*(unavail|down|error)|502|503/i],
  ['auth', /unauthori[sz]ed|forbidden|invalid.*(api.?key|key|token|credential)|authentication|403|401/i],
  ['quota', /quota|insufficient.*(balance|credit|quota)|balance|billing|out of (tokens?|credits)|402/i],
  ['rateLimit', /rate.?limit|too many requests|429/i],
  ['notFound', /not found|no such model|model.*(doesn'?t|does not|unknown|invalid)|404/i],
];

/** HTTP statuses that imply the provider service itself is down. */
const SERVER_ERROR_STATUS = new Set([500, 501, 502, 503, 504, 505, 507]);

export function classifyLlmTestError(
  status: number | undefined,
  message: string | undefined,
): LlmTestErrorKind | undefined {
  const haystack = `${status ?? ''} ${message ?? ''}`;
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(haystack)) return kind;
  }
  if (status !== undefined && SERVER_ERROR_STATUS.has(status)) return 'server';
  return undefined;
}
