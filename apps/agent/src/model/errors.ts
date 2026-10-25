import { AgentError } from '../contracts/errors.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function providerCause(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 64 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    const candidate = record(current);
    if (
      current instanceof AgentError ||
      typeof candidate.status === 'number' ||
      !candidate.cause
    )
      break;
    current = candidate.cause;
  }
  return current;
}

function providerDetails(error: unknown) {
  const outer = record(providerCause(error));
  const inner = record(outer.error);
  return {
    status: typeof outer.status === 'number' ? outer.status : undefined,
    code: String(inner.code ?? outer.code ?? '').toLowerCase(),
    param: String(inner.param ?? outer.param ?? '').toLowerCase(),
    message: String(inner.message ?? outer.message ?? '').toLowerCase(),
    name: String(outer.name ?? ''),
  };
}

export function rejectsEffort(error: unknown): boolean {
  const { status, code, param, message } = providerDetails(error);
  return (
    (status === 400 || status === 422) &&
    (param === 'reasoning_effort' || /reasoning[_ ]effort/.test(message)) &&
    /unsupported|not supported|unknown|unrecognized|not allowed|invalid/.test(
      `${code} ${message}`,
    )
  );
}

/** Provider text is inspected only for classification; only fixed codes leave this module. */
export function modelError(error: unknown, signal?: AbortSignal): AgentError {
  if (error instanceof AgentError) return error;
  const cause = providerCause(error);
  if (cause instanceof AgentError) return cause;
  const { status, code, message, name } = providerDetails(error);
  if (
    signal?.reason?.name === 'TimeoutError' ||
    name === 'TimeoutError' ||
    name === 'APIConnectionTimeoutError' ||
    status === 408 ||
    status === 504
  ) {
    return new AgentError(504, 'upstream_unavailable', 'model_timeout');
  }
  if (status === 401 || /invalid_api_key|authentication_error/.test(code)) {
    return new AgentError(401, 'unauthenticated', 'model_key_invalid');
  }
  if (
    /plan_required|upgrade_required|tier_required/.test(code) ||
    (status !== undefined &&
      status >= 400 &&
      status < 500 &&
      /(?:upgrade|higher|premium|paid).*(?:tier|plan|access)|(?:model|access).*(?:requires?|upgrade).*(?:tier|plan)|must upgrade/.test(
        message,
      ))
  ) {
    return new AgentError(402, 'plan_required', 'model_access_required');
  }
  if (
    status === 402 ||
    /insufficient_quota|quota_exceeded|quota_exhausted|insufficient_balance/.test(
      code,
    ) ||
    (status === 429 && /quota|balance|credits.*exhausted/.test(message))
  ) {
    return new AgentError(402, 'quota_exceeded', 'model_quota_exceeded');
  }
  if (status === 429) {
    return new AgentError(429, 'rate_limited', 'model_rate_limited');
  }
  if (status === 403) {
    return new AgentError(403, 'forbidden', 'model_access_denied');
  }
  if (status === 404 || /model_not_found|invalid_model/.test(code)) {
    return new AgentError(
      400,
      'misconfigured',
      'model_endpoint_or_name_invalid',
    );
  }
  if (status === 400 || status === 422) {
    return new AgentError(400, 'invalid_input', 'model_request_rejected');
  }
  return new AgentError(502, 'upstream_unavailable', 'model_unavailable');
}

/** Strip SDK objects before LangGraph can serialize an error into pending writes. */
export function safeModelFailure(
  error: unknown,
  signal?: AbortSignal,
): AgentError {
  const failure = modelError(error, signal);
  const details = providerDetails(error);
  if (error instanceof AgentError || signal?.aborted) return failure;
  failure.upstreamRetryable =
    failure.payload.errorCode === 'rate_limited' ||
    (failure.payload.errorCode === 'upstream_unavailable' &&
      ((details.status !== undefined && details.status >= 500) ||
        details.name === 'APIConnectionError'));
  return failure;
}
