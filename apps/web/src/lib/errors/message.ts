import type { AppError, AppErrorCodeOrUnknown, AppErrorParams } from './types';

export interface AppErrorCopy {
  /** 已本地化的主句。**永远有值**，且永远是本地语言。 */
  title: string;
  /** 服务端针对这一次失败写的补充说明。语言不保证，所以只能挂在 title 下面。 */
  detail?: string;
}

type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * 码 → 这次失败该显示的话。
 *
 * 文案归前端（ADR-0018）：这个产品里语言是客户端运行时开关（`setPreferredLanguage` 只调
 * `changeLanguage`，不刷新也不重发请求），而 agent 的错误会进聊天记录并持久化——服务端
 * 本地化的串会留下一份永远改不回来的中英混排会话历史。
 *
 * 顺序与旧的 `agentErrorMessage` 相反：以前服务端句子直接当正文，于是「写给运营的英文」
 * 被拿去给买家看。现在本地化的码文案永远当标题，服务端那句降为补充行——屏幕上因此
 * 永远不会只剩一句外语。
 */
export function appErrorCopy(error: AppError, t: Translate): AppErrorCopy {
  const title = translateCode(error.errorCode, error.params, t);
  const detail = error.publicMessage?.trim();
  return { title, ...(detail && detail !== title ? { detail } : {}) };
}

/** 单行版本：给 toast 和聊天气泡这种放不下两行的地方。 */
export function appErrorMessage(error: AppError, t: Translate): string {
  const { title, detail } = appErrorCopy(error, t);
  return detail ? `${title}（${detail}）` : title;
}

function translateCode(
  code: AppErrorCodeOrUnknown,
  params: AppErrorParams | undefined,
  t: Translate,
): string {
  const values = interpolationValues(params, t);

  // key 阶梯：先试按 subject/rule 细化的那条，再退到码本身。13 个码靠 params 细化出
  // 几十句文案，而不是靠往封闭表里加码。
  const refinement =
    typeof params?.rule === 'string'
      ? params.rule
      : typeof params?.subject === 'string'
        ? params.subject
        : undefined;
  if (refinement) {
    const refined = lookup(`errors.${code}.${refinement}`, values, t);
    if (refined) return refined;
  }

  // `errors.<code>` 必然存在——`app.test.ts` 里有一条覆盖测试钉着它。
  return (
    lookup(`errors.${code}`, values, t) ??
    lookup('errors.unknown', values, t) ??
    'Something went wrong'
  );
}

/**
 * i18next 在缺 key 时会返回 key 本身，所以 `copy === key` 也算「没有文案」。
 *
 * 这条来之不易：正是它缺席的时候，用户屏幕上出现了 `agentErrors.agent_run_failed`——
 * 比原始码更糟。
 */
function lookup(
  key: string,
  values: Record<string, unknown>,
  t: Translate,
): string | undefined {
  const copy = t(key, { ...values, defaultValue: '' });
  return copy && copy !== key ? copy : undefined;
}

/**
 * params → 可插值的值。
 *
 * 时间在这里按 locale 渲染成相对说法：后端不知道用户的时区，也不知道他此刻把语言切成了
 * 什么——这正是「参数后端、文案前端」这条分界买来的东西。
 */
function interpolationValues(
  params: AppErrorParams | undefined,
  t: Translate,
): Record<string, unknown> {
  if (!params) return {};
  const values: Record<string, unknown> = { ...params };

  if (typeof params.resetAt === 'string') {
    const relative = relativeTime(params.resetAt);
    if (relative) values.resetAt = relative;
  }
  if (typeof params.retryAfterSec === 'number') {
    values.retryAfter = formatSeconds(params.retryAfterSec, t);
  }
  if (typeof params.period === 'string') {
    values.period = t(`errors.period.${params.period}`, {
      defaultValue: params.period,
    });
  }
  return values;
}

function relativeTime(iso: string): string | undefined {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return undefined;
  const deltaMs = target - Date.now();
  const minutes = Math.round(deltaMs / 60_000);
  const language = resolveLanguage();
  try {
    const formatter = new Intl.RelativeTimeFormat(language, {
      numeric: 'auto',
    });
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    return formatter.format(Math.round(hours / 24), 'day');
  } catch {
    return undefined;
  }
}

function formatSeconds(seconds: number, t: Translate): string {
  const safe = Math.max(1, Math.ceil(seconds));
  if (safe < 60) return t('errors.duration.seconds', { count: safe, defaultValue: `${safe}s` });
  const minutes = Math.ceil(safe / 60);
  return t('errors.duration.minutes', {
    count: minutes,
    defaultValue: `${minutes}min`,
  });
}

/** SSR 与测试里没有 navigator；`undefined` 会让 Intl 用运行时默认 locale。 */
function resolveLanguage(): string | undefined {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  return undefined;
}
