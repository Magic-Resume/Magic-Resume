import { auth } from '@clerk/nextjs/server';
import { API_ORIGIN } from '@/lib/api/routes';

/**
 * 在 `exp` 前这么久就重新铸，避免交出一个飞行途中过期的 token。
 */
const EXPIRY_SAFETY_MS = 10_000;
/** 读不出 `exp` 时的保底缓存时长。Clerk session token 寿命 60s。 */
const FALLBACK_TTL_MS = 45_000;
/** 缓存条目上限。到顶先清过期项，仍然满就整块丢掉——这是缓存，不是账本。 */
const MAX_ENTRIES = 500;

interface CachedToken {
  token: string;
  /** 毫秒时间戳；到点之前这份可以继续用。 */
  expiresAt: number;
}

interface TokenStore {
  cached: Map<string, CachedToken>;
  inFlight: Map<string, Promise<string | null>>;
}

/**
 * 挂在 `globalThis` 上而不是模块作用域：`next dev` 每次改文件都会重建模块，
 * 缓存跟着清空就等于开发期永远没有缓存——而开发期正是这条路最慢的时候。
 */
const store: TokenStore = ((
  globalThis as typeof globalThis & { __magicClerkTokens?: TokenStore }
).__magicClerkTokens ??= { cached: new Map(), inFlight: new Map() });

/** 自己刚铸出来的 token，只读 `exp`，不做验签——验签是 Core 的事。 */
function expiryOf(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) return Date.now() + FALLBACK_TTL_MS;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: unknown };
    return typeof claims.exp === 'number'
      ? claims.exp * 1000 - EXPIRY_SAFETY_MS
      : Date.now() + FALLBACK_TTL_MS;
  } catch {
    return Date.now() + FALLBACK_TTL_MS;
  }
}

function remember(sessionId: string, token: string): void {
  if (store.cached.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of store.cached) {
      if (entry.expiresAt <= now) store.cached.delete(key);
    }
    if (store.cached.size >= MAX_ENTRIES) store.cached.clear();
  }
  store.cached.set(sessionId, { token, expiresAt: expiryOf(token) });
}

/**
 * 当前会话的 token，按 Clerk session 缓存到它自己的 `exp` 之前。
 *
 * `getToken()` 每次调用都现场找 Clerk Frontend API 换一个新 JWT。实测这台机器到
 * `*.clerk.accounts.dev` 一次往返 1.4–2s（其中约 1s 是 TLS 握手），而它躺在
 * `/api/chat-agent/*`、`/api/pdf/parse`、`/api/billing/*` 这 15 条转发路由的必经之路上
 * ——chat 那条还顶在 SSE 首包前面。token 寿命只有 60s，每个请求换一次纯属白付。
 *
 * 缓存不放宽任何东西：交出去的仍是同一个签名 token，Core 照常验签，最长也只比
 * 「每次现铸」多活到它本来的 `exp`。
 */
async function sessionToken(): Promise<string | null> {
  let sessionId: string | null | undefined;
  let getToken: (() => Promise<string | null>) | undefined;
  try {
    const session = await auth();
    sessionId = session.sessionId;
    getToken = session.getToken;
  } catch {
    // self-hosted / no Clerk session → no token
    return null;
  }
  if (!getToken) return null;

  // 没有 sessionId 就没有可靠的缓存键。**绝不退而用 userId**：同一个用户的两个
  // session 共用一份 token 就是串号。这种情况直接现铸，慢但正确。
  const key = sessionId;
  if (!key) return getToken().catch(() => null);

  const hit = store.cached.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.token;

  // 并发合流：一次发送常常同时触发 chat、entitlement 和画布三个请求，
  // 各铸各的等于把这 1.4–2s 付三遍。
  const pending = store.inFlight.get(key);
  if (pending) return pending;

  const mint = getToken()
    .then((token) => {
      if (token) remember(key, token);
      return token;
    })
    .catch(() => null)
    .finally(() => store.inFlight.delete(key));
  store.inFlight.set(key, mint);
  return mint;
}

/**
 * Server-side fetch to the configured API origin that forwards the caller's auth
 * token. Every Next.js route handler that proxies API requests should go through
 * here so auth and content-type handling stay centralized.
 *
 * Streams (SSE) and multipart pass through untouched — the helper only sets
 * auth and a default JSON `Content-Type` (skipped for `FormData`).
 */
export async function serverFetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await sessionToken();

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_ORIGIN}${path}`, { ...init, headers });
}
