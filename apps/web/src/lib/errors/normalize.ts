import {
  codeForStatus,
  codeFromLegacy,
  isAppErrorCode,
  isRetryable,
  type AppError,
  type AppErrorCodeOrUnknown,
  type AppErrorParams,
  type AppErrorSource,
} from './types';

/**
 * 把各个汇聚点抛出来的东西归一成 {@link AppError}。全是纯函数——它们的正确性就是整套
 * 错误层的地基，必须能被逐条断言。
 *
 * 关键的一条不是「新后端发了码」，而是**上游什么都没发时怎么办**：老后端还在线上时，
 * 前端手里只有一个状态码。那条降级路径要当一等公民对待，不是兜底。
 */

interface RawErrorBody {
  errorCode?: unknown;
  subCode?: unknown;
  params?: unknown;
  requestId?: unknown;
  retryable?: unknown;
  code?: unknown;
  message?: unknown;
  /** 老 BFF 的字段，正在退役——它会把 undici 内部与内网 host 泄漏出来。 */
  errorMessage?: unknown;
  error?: unknown;
  detail?: unknown;
}

function asRecord(value: unknown): RawErrorBody {
  return typeof value === 'object' && value !== null
    ? (value as RawErrorBody)
    : {};
}

function readParams(value: unknown): AppErrorParams | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: AppErrorParams = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      out[key] = raw;
    } else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
      out[key] = raw as string[];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 服务端刻意写给人看的那句话。
 *
 * 只认 `message`：`errorMessage` / `error` / `detail` 是老 BFF 与老 readError 的遗产，
 * 里面装的是 `Backend request failed with status 429` 和 undici 的内部消息——把它们当
 * 文案渲染，正是「用户被告知你太快了」这个 bug 的最后一环。
 */
function readPublicMessage(body: RawErrorBody): string | undefined {
  const raw = body.message;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  // `message` 也可能只是个机器码（老信封在没有 message 时会退回 code）——那不是文案。
  if (codeFromLegacy(text) || isAppErrorCode(text)) return undefined;
  return text;
}

/** 从任意错误响应体里读出契约字段；上游没发就按状态合成。 */
export function fromErrorBody(
  status: number | undefined,
  rawBody: unknown,
  source: AppErrorSource,
  cause?: unknown,
): AppError {
  const body = asRecord(rawBody);

  const errorCode: AppErrorCodeOrUnknown = isAppErrorCode(body.errorCode)
    ? body.errorCode
    : (codeFromLegacy(body.code) ??
      (typeof status === 'number' ? codeForStatus(status) : 'unknown'));

  const publicMessage = readPublicMessage(body);

  return {
    errorCode,
    ...(typeof body.subCode === 'string' && body.subCode
      ? { subCode: body.subCode }
      : typeof body.code === 'string' && body.code !== errorCode
        ? { subCode: body.code }
        : {}),
    ...(readParams(body.params) ? { params: readParams(body.params) } : {}),
    ...(typeof status === 'number' ? { httpStatus: status } : {}),
    ...(typeof body.requestId === 'string' && body.requestId
      ? { requestId: body.requestId }
      : {}),
    // 上游的 `retryable` 优先——它知道自己那次失败是不是暂时的；否则按码查表。
    retryable:
      typeof body.retryable === 'boolean'
        ? body.retryable
        : isRetryable(errorCode),
    ...(publicMessage ? { publicMessage } : {}),
    source,
    ...(cause !== undefined ? { cause } : {}),
  };
}

/** fetch 的 `Response`。会把体读掉，所以只在确定不再需要它时调用。 */
export async function fromResponse(
  response: Response,
  source: AppErrorSource = 'bff',
): Promise<AppError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return fromErrorBody(response.status, body, source);
}

/** axios 的错误。网络失败/超时/取消没有响应，走 {@link fromThrown} 的同一套判断。 */
export function fromAxiosError(error: unknown): AppError {
  const axiosError = error as {
    response?: { status?: number; data?: unknown };
    request?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (axiosError?.response) {
    return fromErrorBody(
      axiosError.response.status,
      axiosError.response.data,
      'http',
      error,
    );
  }
  return fromThrown(error, 'http');
}

/**
 * agent 的 SSE 错误帧。
 *
 * 帧里 `error` 与 `payload.code` 是同一个码的两处冗余（老客户端读 `error`），任取其一即可；
 * 新增的 `payload.errorCode` 优先。
 */
export function fromSseEvent(event: {
  error?: unknown;
  payload?: unknown;
}): AppError {
  const payload = asRecord(event.payload);
  const merged: RawErrorBody = {
    ...payload,
    code: payload.code ?? event.error,
  };
  return fromErrorBody(undefined, merged, 'sse');
}

/**
 * 任何被 throw 出来的东西：网络断了、请求被取消、代码抛了个 TypeError。
 *
 * 这条路径上根本没有后端 message——**这正是「前端必须自己有一张码→文案表」的原因**，
 * 与后端要不要做 i18n 无关。
 */
export function fromThrown(
  error: unknown,
  source: AppErrorSource = 'local',
): AppError {
  const name = (error as { name?: unknown })?.name;
  const code = (error as { code?: unknown })?.code;

  // 用户自己点了停止/关了弹窗。这不是故障，调用方通常应当直接丢弃。
  if (name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED') {
    return {
      errorCode: 'unknown',
      subCode: 'aborted',
      retryable: false,
      source,
      cause: error,
    };
  }

  // 连不上、DNS 挂了、超时。是依赖够不着，不是「我们有 bug」。
  if (
    name === 'TypeError' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_NETWORK'
  ) {
    return {
      errorCode: 'upstream_unavailable',
      subCode: 'network',
      retryable: true,
      source,
      cause: error,
    };
  }

  return {
    errorCode: 'internal_error',
    retryable: false,
    source,
    cause: error,
  };
}

/** 这次失败是「用户主动取消」——调用方据此静默丢弃，不弹提示。 */
export function isAborted(error: AppError): boolean {
  return error.subCode === 'aborted';
}

/**
 * Clerk 的错误。**刻意不并进主码表**：Clerk 有自己的封闭词表和 `longMessage` 兜底，
 * 而映射错比不映射更糟——把「验证码过期」说成「验证码错误」，用户会一直重输同一个码。
 * 它只共享 `AppError` 的形状与渲染器。
 */
export function fromClerkError(error: unknown, fallback: string): AppError {
  const clerk = error as {
    errors?: { code?: unknown; longMessage?: unknown; message?: unknown }[];
  };
  const first = Array.isArray(clerk?.errors) ? clerk.errors[0] : undefined;
  const authored =
    (typeof first?.longMessage === 'string' && first.longMessage) ||
    (typeof first?.message === 'string' && first.message) ||
    fallback;
  return {
    errorCode: 'invalid_input',
    ...(typeof first?.code === 'string' ? { subCode: first.code } : {}),
    retryable: false,
    publicMessage: authored,
    source: 'local',
    cause: error,
  };
}
