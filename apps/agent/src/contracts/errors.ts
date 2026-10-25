export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'plan_required'
  | 'conflict'
  | 'not_found'
  | 'session_invalid'
  | 'invalid_input'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'misconfigured'
  | 'internal_error';

export interface ErrorPayload {
  errorCode: ErrorCode;
  subCode: string;
  retryable: boolean;
}

export class AgentError extends Error {
  readonly payload: ErrorPayload;
  upstreamRetryable?: boolean;

  constructor(
    readonly status: number,
    errorCode: ErrorCode,
    subCode: string,
  ) {
    super(subCode);
    this.name = 'AgentError';
    this.payload = {
      errorCode,
      subCode,
      retryable:
        errorCode === 'rate_limited' || errorCode === 'upstream_unavailable',
    };
  }
}
