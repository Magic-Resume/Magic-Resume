import { useSettingStore } from "@/store/useSettingStore";
import { opensBillingGate } from "@/lib/errors/types";
import type { AgentLlmConfig } from "./types";

export type AiAccessResult =
  | { ok: true; config: AgentLlmConfig }
  | { ok: false; reason: "custom_config_required" };

/**
 * The model config a run carries. The open-source app has no hosted credits:
 * every run uses the user's own key (bring-your-own-key), which lives encrypted
 * in this browser and travels with each request to the AI backend. Without one
 * the caller opens the model config card instead of sending.
 */
export function resolveAiAccessConfig(): AiAccessResult {
  const settings = useSettingStore.getState();
  if (!settings.hasLlmConfig()) {
    return { ok: false, reason: "custom_config_required" };
  }
  return {
    ok: true,
    config: {
      source: "byok",
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      modelName: settings.model,
      maxTokens: settings.maxTokens,
      effort: settings.strength,
    },
  };
}

/**
 * Whether a failure means the user's model config cannot run this request, so
 * the model config card should come back: the provider's quota is spent, the
 * model needs a plan the key does not have, the key is rejected or lacks access
 * to the model, or the backend refused the config itself (`misconfigured` with a
 * `model_*` subCode). A backend that is not deployed is not the user's config.
 *
 * Reads the error code where there is one; plain string errors fall back to
 * keywords, without depending on the wording of any one language.
 */
export function isQuotaOrCustomConfigError(error: unknown) {
  const appError = (
    error as { appError?: { errorCode?: unknown; subCode?: unknown } } | null
  )?.appError;
  if (typeof appError?.errorCode === "string") {
    const code = appError.errorCode;
    return (
      opensBillingGate(code as never) ||
      code === "unauthenticated" ||
      code === "forbidden" ||
      (code === "misconfigured" &&
        typeof appError.subCode === "string" &&
        appError.subCode.startsWith("model_"))
    );
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota_exceeded|plan_required|insufficient_quota|insufficient quota|quota|402/i.test(
    message,
  );
}
