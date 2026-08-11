/**
 * 上游的失败要怎么过 BFF 这一关。
 *
 * 三个 route 此前都是**整体替换**：`{ error: \`Backend request failed with status ${status}\` }`。
 * 状态码活了下来，其余全丢——而下游那条按字符串匹配的正则会命中这句话里的 "429"，把
 * 「额度用完」读成「你太快了」，充值入口于是永远不出现。
 *
 * 但也不能改成透传：上游的 4xx `message` 可能是写给运营的英文，甚至说出这个部署配了哪些
 * 支付渠道。所以这里是**投影，不是代理**——白名单本身就是安全边界，只放行五个键，
 * `message` 一律不转发。
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
  /** 老客户端还在读它。保留形状，但只放机器码，不放上游原文。 */
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
