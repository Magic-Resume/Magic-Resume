/**
 * LLM model catalog, grouped by provider. Drives the (grouped) model picker and
 * the model → official base-URL lookup.
 *
 * Model ids verified against each provider's official docs (2026-06):
 *   OpenAI     https://developers.openai.com/api/docs/models
 *   Anthropic  https://platform.claude.com/docs/en/docs/about-claude/models/overview
 *   Google     https://ai.google.dev/gemini-api/docs/models
 *   DeepSeek   https://api-docs.deepseek.com/quick_start/pricing
 * Newest first per provider. Legacy/superseded ids dropped.
 */
export interface ModelInfo {
  /** exact API `model` string */
  id: string;
  /** whether this model accepts image input (known from provider docs) */
  supportsImage: boolean;
}

export interface ModelProvider {
  /** stable provider key */
  id: string;
  /** display name shown as the group header */
  label: string;
  /** official API base URL for this provider (empty for custom) */
  baseUrl: string;
  /** models (exact API `model` strings), newest first */
  models: ModelInfo[];
  /** console URL where the user obtains an API key (empty for custom) */
  keyUrl: string;
  /** recommended default model id picked when this provider is selected */
  defaultModel: string;
  /** sensible default max tokens applied when this provider is selected */
  defaultMaxTokens: number;
  /** brand accent (hex) for the picker dot — purely cosmetic */
  brandColor: string;
}

/** id of the catch-all "bring any OpenAI-compatible endpoint" provider (Ollama, proxies, …). */
export const CUSTOM_PROVIDER_ID = 'custom';

/** fallback max tokens — long resume optimize/translate/create outputs need headroom. */
export const DEFAULT_MAX_TOKENS = 8192;

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.5', supportsImage: true },
      { id: 'gpt-5.4', supportsImage: true },
      { id: 'gpt-5.4-mini', supportsImage: true },
      { id: 'gpt-5.4-nano', supportsImage: true },
    ],
    keyUrl: 'https://platform.openai.com/account/api-keys',
    defaultModel: 'gpt-5.5',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#10a37f',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    // API ids use dashes (claude-opus-4-8), not dots.
    models: [
      { id: 'claude-fable-5', supportsImage: true },
      { id: 'claude-opus-4-8', supportsImage: true },
      { id: 'claude-sonnet-4-6', supportsImage: true },
      { id: 'claude-haiku-4-5', supportsImage: true },
    ],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-sonnet-4-6',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#cc785c',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-3.5-flash', supportsImage: true },
      { id: 'gemini-3.1-pro-preview', supportsImage: true },
      { id: 'gemini-2.5-pro', supportsImage: true },
      { id: 'gemini-2.5-flash', supportsImage: true },
    ],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-3.5-flash',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#4285f4',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    // deepseek-chat / deepseek-reasoner are deprecated 2026-07-24 (→ deepseek-v4-flash).
    // Both V4 models are text-only — no image input on the official API.
    models: [
      { id: 'deepseek-v4-pro', supportsImage: false },
      { id: 'deepseek-v4-flash', supportsImage: false },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-v4-flash',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#4d6bfe',
  },
  {
    id: CUSTOM_PROVIDER_ID,
    label: '自定义 / Custom',
    // No preset URL/model — covers Ollama, gateways, and any OpenAI-compatible endpoint.
    baseUrl: '',
    models: [],
    keyUrl: '',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#a1a1aa',
  },
];

/**
 * model id → official API base URL. Derived from {@link MODEL_PROVIDERS} so the
 * two never drift. Used by the settings page to auto-fill the base URL on select.
 */
export const MODEL_API_URL_MAP: Record<string, string> = Object.fromEntries(
  MODEL_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => [model.id, provider.baseUrl]),
  ),
);

/**
 * model id → known image-input support. `undefined` when unknown (custom models).
 */
export const MODEL_IMAGE_SUPPORT_MAP: Record<string, boolean> = Object.fromEntries(
  MODEL_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => [model.id, model.supportsImage]),
  ),
);

/** Look up a provider by its stable id. */
export const getProvider = (id: string): ModelProvider | undefined =>
  MODEL_PROVIDERS.find((p) => p.id === id);

/**
 * Reverse-derive the provider id from a saved base URL. Used to migrate legacy
 * settings (which stored only baseUrl/model) onto the explicit `provider` field.
 * Falls back to {@link CUSTOM_PROVIDER_ID} when no preset matches.
 */
export const deriveProviderId = (baseUrl: string): string => {
  const match = MODEL_PROVIDERS.find((p) => p.baseUrl && p.baseUrl === baseUrl);
  return match ? match.id : CUSTOM_PROVIDER_ID;
};
