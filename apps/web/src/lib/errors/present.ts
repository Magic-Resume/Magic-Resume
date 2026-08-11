import { toast } from 'sonner';
import i18n from '@/i18n';
import { appErrorCopy, appErrorMessage } from './message';
import { isAborted } from './normalize';
import { opensBillingGate, type AppError } from './types';

/**
 * 一次失败该怎么出现在屏幕上。
 *
 * 抽成单一决策点，是因为此前这件事分散在 66 个各写各的 toast 调用点上——同一个码在两处
 * 是两种表现，而三处最痛的失败（手动保存失败、开 AI 前的同步失败、SSE 帧解析失败）
 * 干脆只 `console.error` 了事：用户按了按钮，然后什么都没发生。
 */
export type ErrorSurface =
  /** 对话流里的一条消息。agent 相关的失败用它，因为它会留在会话记录里。 */
  | 'chat'
  /** 就地提示：用户刚点的那个按钮旁边。 */
  | 'inline'
  /** 整页级：这一屏没法继续了。 */
  | 'page'
  /** 后台失败：用户没在等它，但状态已经不对了。 */
  | 'background';

export interface PresentOptions {
  surface?: ErrorSurface;
  /** 可重试且调用方给得出重试动作时，提示上会带一个按钮。 */
  onRetry?: () => void;
  /** 额度/套餐类失败的去处，通常是打开充值弹窗。 */
  onUpgrade?: () => void;
}

export interface PresentedError {
  title: string;
  detail?: string;
  /** 该不该把充值/升级入口亮出来。读的是码，不是中文串。 */
  billingGate: boolean;
  retryable: boolean;
}

/**
 * 渲染一次失败，并返回渲染决策（调用方要自己接管 UI 时可以只取返回值）。
 *
 * 用户主动取消不是故障：静默丢弃，不弹任何东西。
 */
export function presentAppError(
  error: AppError,
  options: PresentOptions = {},
): PresentedError | null {
  if (isAborted(error)) return null;

  const t = i18n.t.bind(i18n);
  const { title, detail } = appErrorCopy(error, t);
  const billingGate = opensBillingGate(error.errorCode);
  const decision: PresentedError = {
    title,
    ...(detail ? { detail } : {}),
    billingGate,
    retryable: error.retryable,
  };

  reportToConsole(error, title);

  const surface = options.surface ?? 'inline';
  // 对话流由调用方自己插消息——它要进会话记录，不是一闪而过的提示。
  if (surface === 'chat') return decision;

  const action = billingGate && options.onUpgrade
    ? {
        label: t('errors.actions.upgrade', { defaultValue: '去充值' }),
        onClick: options.onUpgrade,
      }
    : error.retryable && options.onRetry
      ? {
          label: t('errors.actions.retry', { defaultValue: '重试' }),
          onClick: options.onRetry,
        }
      : undefined;

  toast.error(title, {
    ...(detail ? { description: detail } : {}),
    ...(action ? { action } : {}),
    // 后台失败用户没在等，别抢焦点；整页级的要停久一点。
    duration: surface === 'background' ? 4000 : surface === 'page' ? 10000 : 6000,
  });

  return decision;
}

/** 只渲染文案、不弹提示——聊天气泡与行内错误位用它。 */
export function appErrorText(error: AppError): string {
  return appErrorMessage(error, i18n.t.bind(i18n));
}

/**
 * 任意抛出值 → 一句能给人看的话。
 *
 * 收敛期的桥：不是每个 catch 都已经拿到 `AppError`。带码的走契约，剩下的用调用方给的
 * 兜底句——**绝不把 `error.message` 直接渲染出去**，那正是 `agent_run_failed` 和
 * "Backend request failed with status 429" 上过屏幕的原因。
 */
export function errorText(error: unknown, fallback: string): string {
  const carried = (error as { appError?: AppError } | null)?.appError;
  if (carried?.errorCode) return appErrorText(carried);
  if (isAppErrorShaped(error)) return appErrorText(error);
  return fallback;
}

function isAppErrorShaped(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppError).errorCode === 'string' &&
    typeof (value as AppError).source === 'string'
  );
}

/**
 * 诊断信息写控制台。`subCode` 与 `requestId` 永远不渲染给用户，但它们正是排查时唯一
 * 有用的东西——用户截个图就能把 requestId 给我们。
 */
function reportToConsole(error: AppError, title: string) {
  const parts = [error.errorCode, error.subCode, error.requestId].filter(
    Boolean,
  );
  console.warn(`[error] ${parts.join(' · ')} — ${title}`, error.cause ?? '');
}
