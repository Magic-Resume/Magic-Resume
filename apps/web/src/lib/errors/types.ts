/**
 * 前端这一侧的错误契约（Core ADR-0018）。
 *
 * 刻意是**独立的一份**，不从后端包里引：两个仓分别发版，任何一刻都可能是「新前端 + 老后端」
 * 或反过来。共享一份类型只会把版本偏斜变成构建失败，而这里真正需要的是偏斜时优雅降级——
 * 靠的是下面那张 `codeForStatus` 兜底表，它必须与后端逐条一致。
 */
export const APP_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'plan_required',
  'not_found',
  'invalid_input',
  'conflict',
  'session_invalid',
  'quota_exceeded',
  'rate_limited',
  'content_rejected',
  'upstream_unavailable',
  'misconfigured',
  'internal_error',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** 后端发了一个我们不认识的码——即「新后端 + 老前端」。文案退到通用兜底。 */
export type AppErrorCodeOrUnknown = AppErrorCode | 'unknown';

export type AppErrorParamValue = string | number | boolean | readonly string[];
export type AppErrorParams = Record<string, AppErrorParamValue>;

/** 这次失败是从哪个汇聚点进来的。只用于上报与调试，不影响文案。 */
export type AppErrorSource =
  | 'http'
  | 'sse'
  | 'bff'
  | 'react'
  | 'window'
  | 'local';

export interface AppError {
  errorCode: AppErrorCodeOrUnknown;
  /** 高基数二级码。**只进上报，永不渲染**。 */
  subCode?: string;
  params?: AppErrorParams;
  httpStatus?: number;
  requestId?: string;
  retryable: boolean;
  /** 服务端刻意写给人看的补充句。语言不保证，所以只能当 detail 行，永不单独成句。 */
  publicMessage?: string;
  source: AppErrorSource;
  /** 仅开发期诊断用，永不渲染给用户。 */
  cause?: unknown;
}

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === 'string' &&
    (APP_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * 没有 `errorCode` 时由 HTTP 状态合成。
 *
 * **必须与后端 `@magic/util` 的同名函数逐条一致**：「老后端 + 新前端」会长期存在，那时这张表
 * 就是全部的判据；两边分歧会让同一次失败在两侧被归成两个码。
 *
 * 429 落 `rate_limited` 而不是 `quota_exceeded`：额度必须由上游显式发码。猜是猜不对的——
 * 这正是本次要修的那个 bug 的成因。
 */
export function codeForStatus(status: number): AppErrorCode {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return 'invalid_input';
    case 401:
      return 'unauthenticated';
    case 402:
      return 'quota_exceeded';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 410:
      return 'session_invalid';
    case 429:
      return 'rate_limited';
    case 408:
    case 502:
    case 503:
    case 504:
      return 'upstream_unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'invalid_input';
  }
}

/**
 * 存量字符串码 → 一级码。上游还没升级完的那几周，这张表就是全部的可用信息。
 * 与后端 `codeFromLegacy` 同一份。
 */
const LEGACY_CODE_ALIASES: Readonly<Record<string, AppErrorCode>> = {
  quota_exhausted: 'quota_exceeded',
  insufficient_quota: 'quota_exceeded',
  rate_limit_exceeded: 'rate_limited',
  invalid_api_key: 'unauthenticated',
  model_not_allowed: 'forbidden',
  model_not_found: 'invalid_input',
  model_unavailable: 'upstream_unavailable',
  upstream_error: 'upstream_unavailable',
  entitlement_unavailable: 'internal_error',
  billing_operation_in_progress: 'conflict',
  agent_run_failed: 'internal_error',
};

export function codeFromLegacy(value: unknown): AppErrorCode | undefined {
  if (typeof value !== 'string') return undefined;
  if (isAppErrorCode(value)) return value;
  return LEGACY_CODE_ALIASES[value];
}

/**
 * 值不值得重试。
 *
 * 只有这两个为 true。以前 SSE 帧里是硬编码的 `retryable: true`，对「余额不足」也说 true——
 * 客户端于是去重试一个永远不会成功的请求，每次还占掉一次配额预留。
 */
const RETRYABLE_CODES = new Set<string>([
  'rate_limited',
  'upstream_unavailable',
]);

export function isRetryable(code: AppErrorCodeOrUnknown): boolean {
  return RETRYABLE_CODES.has(code);
}

/**
 * 这两个码要额外打开充值/升级入口。
 *
 * 以前这个判断靠 grep 另一个函数产出的中文串「额度不足」——谁把那句国际化成英文，闸门就
 * 静默失效。现在它读码。
 */
export function opensBillingGate(code: AppErrorCodeOrUnknown): boolean {
  return code === 'quota_exceeded' || code === 'plan_required';
}
