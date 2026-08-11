import { useSettingStore } from "@/store/useSettingStore";
import {
  fetchEntitlement,
  invalidateEntitlementCache,
} from "@/lib/extensions/billing-client";
import type { Entitlement } from "@/lib/billing/types";
import { opensBillingGate } from "@/lib/errors/types";
import type { AgentLlmConfig } from "./types";

export type AiEntitlement = Entitlement;

export type AiAccessResult =
  | { ok: true; config: AgentLlmConfig; entitlement?: AiEntitlement }
  | {
      ok: false;
      reason: "custom_config_required" | "entitlement_unavailable";
      entitlement?: AiEntitlement;
      message?: string;
    };

export async function resolveAiAccessConfig(
  options: { forceRefresh?: boolean } = {},
): Promise<AiAccessResult> {
  const settings = useSettingStore.getState();
  const hasByok = settings.hasLlmConfig();
  const pref = settings.preferredSource;

  /**
   * Internal AI without a confirmed entitlement, for when the check could not
   * reach a verdict. No `entitlement` on the result: nothing downstream should
   * read a balance we never received.
   */
  const unverifiedInternalConfig = (): AiAccessResult => ({
    ok: true,
    config: {
      source: "internal",
      ...(settings.selectedModel ? { modelName: settings.selectedModel } : {}),
      effort: settings.strength,
    },
  });

  const byokConfig = (entitlement?: AiEntitlement): AiAccessResult => ({
    ok: true,
    config: {
      source: "byok",
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      modelName: settings.model,
      maxTokens: settings.maxTokens,
      effort: settings.strength,
    },
    ...(entitlement ? { entitlement } : {}),
  });

  // Explicit BYOK with a valid config uses the user's own key — it never touches
  // internal credits, so skip the /ai-entitlement round-trip entirely (this also
  // lets BYOK keep working when that endpoint is unavailable / the user is logged out).
  if (pref === "byok" && hasByok) return byokConfig();

  let entitlement: AiEntitlement;
  try {
    entitlement = await getAiEntitlement(options.forceRefresh);
  } catch (error) {
    // Entitlement check failed — degrade to the user's own key if they have one.
    if (hasByok) return byokConfig();

    // Otherwise it depends on *what* failed. A timeout, a dead connection or a
    // 5xx means we could not find out whether this user is entitled — which is
    // not the same as finding out they are not. Blocking on it takes a paying
    // user's import away because a hop was slow, while the server enforces the
    // quota regardless and answers `insufficient_quota` with copy of its own if
    // they really have none. So let it through and let the answer come from the
    // side that actually knows.
    if (isInconclusive(error)) return unverifiedInternalConfig();

    const message = error instanceof Error ? error.message : "账户额度检查失败";
    return { ok: false, reason: "entitlement_unavailable", message };
  }

  const canInternal = Boolean(entitlement.canUseInternal);

  // No hard-coded backend default: send the user's picked model, else fall back to
  // the first offered model. modelName is only omitted when we truly have neither.
  const internalModel =
    settings.selectedModel || entitlement.availableModels?.[0];
  const internalConfig = (): AiAccessResult => ({
    ok: true,
    config: {
      source: "internal",
      ...(internalModel ? { modelName: internalModel } : {}),
      effort: settings.strength,
    },
    entitlement,
  });

  if (pref === "internal" && canInternal) return internalConfig();

  // Auto: internal when entitled, else the user's own key, else prompt to configure.
  if (canInternal) return internalConfig();
  if (hasByok) return byokConfig(entitlement);

  return { ok: false, reason: "custom_config_required", entitlement };
}

export function invalidateAiEntitlement() {
  invalidateEntitlementCache();
}

/**
 * True when a failed entitlement check tells us nothing about entitlement.
 *
 * Read structurally rather than by class: the check itself lives in the
 * commercial overlay, and this module must not import from it — the same
 * duck-typed contract `httpStatus` uses on the server. An unmarked error is
 * treated as an answer, so a build whose entitlement client predates the
 * marker keeps failing closed rather than silently opening up.
 */
function isInconclusive(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { inconclusive?: unknown }).inconclusive === true
  );
}

/**
 * 这次失败该不该把充值/升级入口亮出来。
 *
 * 以前它 grep 的是 `friendlyAgentError` 产出的中文串「额度不足」——一个闸门的正确性，
 * 挂在另一个函数里的四个汉字上：谁把那句国际化成英文，闸门就静默失效，而没有任何测试
 * 会红。现在读的是码，两边同源（Core ADR-0018）。
 *
 * 仍然容忍纯字符串错误：不是所有调用点都已经带上 `AppError`（Clerk、老 catch 分支），
 * 那些走原来的关键词兜底——但不再依赖任何一种语言的措辞。
 */
export function isQuotaOrCustomConfigError(error: unknown) {
  const appError = (error as { appError?: { errorCode?: unknown } } | null)
    ?.appError;
  if (typeof appError?.errorCode === "string") {
    return opensBillingGate(appError.errorCode as never);
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota_exceeded|plan_required|insufficient_quota|insufficient quota|quota|402/i.test(
    message,
  );
}

async function getAiEntitlement(forceRefresh = false): Promise<AiEntitlement> {
  return fetchEntitlement({ force: forceRefresh });
}
