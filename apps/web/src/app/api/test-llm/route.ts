import { getServerUserId } from '@/lib/auth/server';

// Runs server-side so the provider ping isn't blocked by browser CORS (OpenAI /
// Anthropic don't allow direct browser calls). No Python backend involved — this
// route hits the provider directly with the user's BYOK key to validate it.
export const runtime = 'nodejs';

interface TestBody {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

interface ProbeResult {
  ok: boolean;
  status?: number;
  message?: string;
  /** true = accepts image input, false = rejected, undefined = couldn't tell */
  supportsImage?: boolean;
}

const TIMEOUT_MS = 12_000;
const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');

// SSRF guard: this probe runs server-side against a user-supplied baseUrl, so the
// host must be an allow-listed provider — otherwise the route could be driven to
// reach internal services / cloud metadata endpoints (169.254.169.254, localhost).
// Operators self-hosting a custom OpenAI-compatible gateway can opt extra hosts in
// via the TEST_LLM_ALLOWED_HOSTS env var (comma-separated), which stays an
// operator-controlled allow-list rather than an attacker-controlled target.
const DEFAULT_ALLOWED_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
];
const ALLOWED_HOSTS = new Set([
  ...DEFAULT_ALLOWED_HOSTS,
  ...(process.env.TEST_LLM_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
]);

function validateProbeBaseUrl(raw: string): { ok: true } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: 'Invalid baseUrl' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: 'baseUrl must use http(s)' };
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, message: `baseUrl host is not allowed: ${url.hostname}` };
  }
  return { ok: true };
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Map a provider HTTP response into a compact pass/fail result. */
async function toResult(res: Response): Promise<ProbeResult> {
  if (res.ok) return { ok: true, status: res.status };
  let message = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const fromError =
      typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    message = fromError || parsed.message || text || message;
  } catch {
    // non-JSON body — keep the HTTP status message
  }
  return { ok: false, status: res.status, message: String(message).slice(0, 200) };
}

/** Provider-aware reachability + key check. Prefers the cheap GET /models probe. */
async function probe(
  provider: string,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<ProbeResult> {
  if (provider === 'google') {
    // Gemini: API key rides in the query string; list-models validates it.
    const res = await timedFetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
    });
    return toResult(res);
  }

  if (provider === 'anthropic') {
    const res = await timedFetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    return toResult(res);
  }

  // openai / deepseek / custom — OpenAI-compatible. Try GET /models first…
  const auth = { Authorization: `Bearer ${apiKey}` };
  const listed = await timedFetch(`${baseUrl}/models`, { method: 'GET', headers: auth });
  if (listed.status !== 404 && listed.status !== 405) return toResult(listed);

  // …some gateways / local servers (e.g. Ollama variants) don't expose /models —
  // fall back to a 1-token chat completion, which also confirms the model id.
  const chat = await timedFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  });
  return toResult(chat);
}

// 1x1 transparent PNG — tiny enough to probe image support for ~free.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Error bodies from providers that reject image input mention the offending part
// ("image", "vision", "multimodal", …). Anything else is inconclusive.
const IMAGE_REJECT_PATTERN = /image|vision|multimodal|visual|图片|图像|附件|attachment/i;

/**
 * Provider-aware image-support probe. Sends the model a message containing a
 * 1x1 PNG and checks whether the endpoint accepts it:
 *  - 2xx            → supportsImage: true
 *  - 4xx + reject-ish message → supportsImage: false
 *  - anything else  → supportsImage: undefined (unknown, don't guess)
 */
async function probeImageSupport(
  provider: string,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<ProbeResult> {
  const auth = { Authorization: `Bearer ${apiKey}` };
  let url = `${baseUrl}/chat/completions`;
  let headers: Record<string, string> = { ...auth, 'Content-Type': 'application/json' };
  let body: unknown;

  if (provider === 'anthropic') {
    headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    body = {
      model,
      max_tokens: 1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ping' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: TINY_PNG_BASE64 } },
          ],
        },
      ],
    };
  } else if (provider === 'google') {
    url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'ping' },
            { inline_data: { mime_type: 'image/png', data: TINY_PNG_BASE64 } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1 },
    };
  } else {
    // openai / deepseek / custom — OpenAI-compatible format.
    body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ping' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` } },
          ],
        },
      ],
      max_tokens: 1,
    };
  }

  const res = await timedFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.ok) return { ok: true, status: res.status, supportsImage: true };

  const failed = await toResult(res);
  const rejected = !failed.ok && !!failed.status && failed.status < 500 && IMAGE_REJECT_PATTERN.test(failed.message || '');
  return { ok: true, supportsImage: rejected ? false : undefined };
}

export async function POST(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return json({ ok: false, message: 'Unauthorized' }, 401);

  let body: TestBody;
  try {
    body = (await request.json()) as TestBody;
  } catch {
    return json({ ok: false, message: 'Invalid JSON body' }, 400);
  }

  const provider = body.provider || 'custom';
  const apiKey = body.apiKey?.trim();
  const model = body.model?.trim();
  const baseUrl = body.baseUrl ? stripTrailingSlash(body.baseUrl.trim()) : '';
  if (!apiKey || !baseUrl || !model) {
    return json({ ok: false, message: 'Missing apiKey / baseUrl / model' }, 400);
  }

  const urlCheck = validateProbeBaseUrl(baseUrl);
  if (!urlCheck.ok) {
    return json({ ok: false, message: urlCheck.message }, 400);
  }

  const startedAt = Date.now();
  try {
    const result = await probe(provider, baseUrl, apiKey, model);
    if (!result.ok) {
      return json({ ...result, latencyMs: Date.now() - startedAt }, 200);
    }
    const image = await probeImageSupport(provider, baseUrl, apiKey, model);
    return json(
      { ...result, latencyMs: Date.now() - startedAt, supportsImage: image.supportsImage },
      200,
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'timeout'
          : err.message
        : 'request failed';
    return json({ ok: false, message }, 200);
  }
}
