/**
 * Project upstream failures at the BFF boundary.
 *
 * Only machine-readable fields cross the boundary. Provider messages may
 * contain internal topology or operational details and must stay server-side.
 */
const FORWARDED_KEYS = [
  'errorCode',
  'subCode',
  'params',
  'requestId',
  'retryable',
] as const;

export interface ProjectedError {
  errorCode?: unknown;
  subCode?: unknown;
  params?: unknown;
  requestId?: unknown;
  retryable?: unknown;
  /** Legacy clients still read this field; keep it machine-readable. */
  error: string;
}

export function projectUpstreamError(
  status: number,
  rawBody: string,
): ProjectedError {
  const projected: Record<string, unknown> = {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = undefined;
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const body = parsed as Record<string, unknown>;
    for (const key of FORWARDED_KEYS) {
      if (body[key] !== undefined) projected[key] = body[key];
    }
  }

  return {
    ...projected,
    error:
      typeof projected.errorCode === 'string'
        ? projected.errorCode
        : `upstream_${status}`,
  };
}
