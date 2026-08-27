/**
 * LLM model catalog, grouped by provider. Drives the (grouped) model picker, the
 * model → official base-URL lookup, and the brand marks reused by the AI Lab
 * composer (`/public/providers/{id}.svg`).
 *
 * Model ids verified 2026-08 against models.dev + each provider's own docs.
 * Newest first per provider. Legacy/superseded ids dropped.
 *
 * Two honest caveats baked into the data:
 *   1. **Aggregators** (OpenRouter / Groq / Together / Fireworks / SiliconFlow)
 *      serve thousands of third-party models under `vendor/model` ids that churn
 *      weekly. Enumerating them here would be stale before it shipped, so they
 *      ship with `models: []` and the settings form falls back to a free-text
 *      model field (see `ModelConfigFields`). Empty is a deliberate signal, not
 *      a TODO.
 *   2. **Qwen's** OpenAI-compatible endpoint is now workspace-scoped. There is no
 *      single correct URL to preset, so the template carries a literal
 *      `{WorkspaceId}` placeholder and the form tells the user to replace it.
 */
export interface ModelInfo {
  /** exact API `model` string */
  id: string;
  /** whether this model accepts image input (known from provider docs) */
  supportsImage: boolean;
}

export interface ModelProvider {
  /** stable provider key; also the filename of its mark: /public/providers/{id}.svg */
  id: string;
  /** display name shown as the group header */
  label: string;
  /** official API base URL for this provider (empty for custom) */
  baseUrl: string;
  /** models (exact API `model` strings), newest first. Empty = free-text field. */
  models: ModelInfo[];
  /** console URL where the user obtains an API key (empty for custom) */
  keyUrl: string;
  /** recommended default model id picked when this provider is selected */
  defaultModel: string;
  /** sensible default max tokens applied when this provider is selected */
  defaultMaxTokens: number;
  /** brand accent (hex) for the picker mark */
  brandColor: string;
  /**
   * Brand mark is monochrome (OpenAI, xAI, Kimi, …). Its real colour is
   * black-or-white, which reads wrong on either theme — these render in the
   * surrounding text colour instead of `brandColor`.
   */
  monochrome?: boolean;
  /** Which group the picker files it under. */
  region: 'global' | 'china' | 'custom';
  /** Base URL needs the user to substitute something before it will work. */
  baseUrlNeedsEdit?: boolean;
}

/** id of the catch-all "bring any OpenAI-compatible endpoint" provider (Ollama, proxies, …). */
export const CUSTOM_PROVIDER_ID = 'custom';

/** fallback max tokens — long resume optimize/translate/create outputs need headroom. */
export const DEFAULT_MAX_TOKENS = 16_384;

export const MODEL_PROVIDERS: ModelProvider[] = [
  // ── 国外 ────────────────────────────────────────────────────────────────
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.6-sol', supportsImage: true },
      { id: 'gpt-5.5-pro', supportsImage: true },
      { id: 'gpt-5.5', supportsImage: true },
      { id: 'gpt-5.4-mini', supportsImage: true },
    ],
    keyUrl: 'https://platform.openai.com/account/api-keys',
    defaultModel: 'gpt-5.5',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#10a37f',
    monochrome: true,
    region: 'global',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    // API ids use dashes (claude-opus-5), not dots.
    models: [
      { id: 'claude-fable-5', supportsImage: true },
      { id: 'claude-opus-5', supportsImage: true },
      { id: 'claude-sonnet-5', supportsImage: true },
      { id: 'claude-haiku-4-5', supportsImage: true },
    ],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-sonnet-5',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#cc785c',
    region: 'global',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-3.6-flash', supportsImage: true },
      { id: 'gemini-3.5-flash-lite', supportsImage: true },
      { id: 'gemini-3.1-pro-preview', supportsImage: true },
      { id: 'gemini-2.5-pro', supportsImage: true },
    ],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-3.6-flash',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#4285f4',
    region: 'global',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-4.5', supportsImage: true },
      { id: 'grok-4.3', supportsImage: true },
    ],
    keyUrl: 'https://console.x.ai',
    defaultModel: 'grok-4.5',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#e5e5e5',
    monochrome: true,
    region: 'global',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-2512', supportsImage: false },
      { id: 'devstral-2512', supportsImage: false },
    ],
    keyUrl: 'https://console.mistral.ai/api-keys',
    defaultModel: 'mistral-large-2512',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#fa520f',
    region: 'global',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    // Cohere's OpenAI-SDK compatibility layer, not the native /v1 chat endpoint.
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    models: [
      { id: 'command-a-plus-05-2026', supportsImage: false },
      { id: 'command-a-03-2025', supportsImage: false },
    ],
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    defaultModel: 'command-a-plus-05-2026',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#ff7759',
    region: 'global',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    models: [
      { id: 'sonar-reasoning-pro', supportsImage: false },
      { id: 'sonar-pro', supportsImage: false },
    ],
    keyUrl: 'https://www.perplexity.ai/settings/api',
    defaultModel: 'sonar-pro',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#20808d',
    region: 'global',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [], // aggregator — see the file header
    keyUrl: 'https://console.groq.com/keys',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#f55036',
    region: 'global',
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: [],
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#0f6fff',
    region: 'global',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    models: [],
    keyUrl: 'https://fireworks.ai/account/api-keys',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#5a31f4',
    region: 'global',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    keyUrl: 'https://openrouter.ai/keys',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#94a3b8',
    monochrome: true,
    region: 'global',
  },

  // ── 国内 ────────────────────────────────────────────────────────────────
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4-pro', supportsImage: false },
      { id: 'deepseek-v4-flash', supportsImage: false },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-v4-flash',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#4d6bfe',
    region: 'china',
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen',
    // 阿里百炼的 OpenAI 兼容端点已改为工作区级，没有一个「正确的」静态地址可预置。
    baseUrl: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    baseUrlNeedsEdit: true,
    models: [
      { id: 'qwen3.7-max', supportsImage: false },
      { id: 'qwen3.7-plus', supportsImage: true },
      { id: 'qwen3.7-flash', supportsImage: false },
    ],
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    defaultModel: 'qwen3.7-plus',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#6950ef',
    region: 'china',
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    // 官方端点是 .ai，不是 .cn。
    baseUrl: 'https://api.moonshot.ai/v1',
    models: [
      { id: 'kimi-k3', supportsImage: true },
      { id: 'kimi-k2.7-code', supportsImage: false },
      { id: 'kimi-k2.6', supportsImage: true },
    ],
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    defaultModel: 'kimi-k3',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#16b364',
    monochrome: true,
    region: 'china',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5.2', supportsImage: false },
      { id: 'glm-5.1', supportsImage: false },
      { id: 'glm-5', supportsImage: false },
    ],
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    defaultModel: 'glm-5.2',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#3859ff',
    region: 'china',
  },
  {
    id: 'doubao',
    label: '火山方舟 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-seed-2.0-pro', supportsImage: true },
      { id: 'doubao-seed-2.0-lite', supportsImage: true },
      { id: 'doubao-seed-2.0-mini', supportsImage: true },
    ],
    keyUrl: 'https://console.volcengine.com/ark',
    defaultModel: 'doubao-seed-2.0-pro',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#1664ff',
    region: 'china',
  },
  {
    id: 'wenxin',
    label: '百度千帆 文心',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: [
      { id: 'ernie-5.1', supportsImage: true },
      { id: 'ernie-5.0-turbo', supportsImage: true },
    ],
    keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/onlineService',
    defaultModel: 'ernie-5.1',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#2932e1',
    region: 'china',
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      { id: 'hunyuan-turbos', supportsImage: false },
      { id: 'hunyuan-turbos-vision', supportsImage: true },
    ],
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    defaultModel: 'hunyuan-turbos',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#0052d9',
    region: 'china',
  },
  {
    id: 'minimax',
    label: 'MiniMax 稀宇',
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'MiniMax-M2.5', supportsImage: false },
    ],
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    defaultModel: 'MiniMax-M2.5',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#e73562',
    region: 'china',
  },
  {
    id: 'stepfun',
    label: '阶跃星辰 StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    models: [],
    keyUrl: 'https://platform.stepfun.com/interface-key',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#005aff',
    region: 'china',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    defaultModel: '',
    defaultMaxTokens: DEFAULT_MAX_TOKENS,
    brandColor: '#7c3aed',
    region: 'china',
  },

  // ── 兜底 ────────────────────────────────────────────────────────────────
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
    monochrome: true,
    region: 'custom',
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

/**
 * 模型名 → 服务商 id。给 AI Lab 的模型标用：那边只知道一个模型名（内置目录由后端
 * 下发，BYOK 更是用户随便填），要认出是哪家才能复用 /public/providers/{id}.svg。
 *
 * 先精确匹配目录里的 model id，再按名字里的家族关键字兜底——`gpt-5.6-sol` 认得出，
 * 用户自己填的 `gpt-4o-mini-2024-07-18` 也认得出。
 */
const FAMILY_HINTS: [providerId: string, needles: string[]][] = [
  ['anthropic', ['claude', 'anthropic', 'opus', 'sonnet', 'haiku', 'fable']],
  ['openai', ['gpt', 'openai', 'codex', 'o1-', 'o3-', 'o4-']],
  ['google', ['gemini', 'palm', 'bison']],
  ['deepseek', ['deepseek']],
  ['qwen', ['qwen', 'tongyi', 'qwq']],
  ['moonshot', ['kimi', 'moonshot']],
  ['zhipu', ['glm', 'zhipu', 'chatglm']],
  ['doubao', ['doubao', 'volc', 'ark-', 'seed-']],
  ['wenxin', ['ernie', 'wenxin', 'qianfan']],
  ['hunyuan', ['hunyuan']],
  ['minimax', ['minimax', 'abab']],
  ['stepfun', ['step-', 'stepfun']],
  ['xai', ['grok', 'xai']],
  ['mistral', ['mistral', 'mixtral', 'devstral', 'magistral']],
  ['cohere', ['command-a', 'command-r', 'cohere']],
  ['perplexity', ['sonar', 'perplexity']],
];

export function resolveProviderIdFromModel(model: string): string | null {
  const name = model.trim().toLowerCase();
  if (!name) return null;
  const exact = MODEL_PROVIDERS.find((p) =>
    p.models.some((m) => m.id.toLowerCase() === name),
  );
  if (exact) return exact.id;
  const hinted = FAMILY_HINTS.find(([, needles]) => needles.some((n) => name.includes(n)));
  return hinted ? hinted[0] : null;
}
