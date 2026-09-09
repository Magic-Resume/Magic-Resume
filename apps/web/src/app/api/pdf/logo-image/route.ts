import { NextResponse } from 'next/server';

const MAX_LOGO_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_LOGO_ORIGIN = 'https://pub-ca5e6f293e274c1b9298cf78d112e0be.r2.dev';
const ALLOWED_CONTENT_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg']);

const configuredLogoOrigin = (): string => {
  try {
    return new URL(process.env.R2_PUBLIC_BASE_URL || DEFAULT_LOGO_ORIGIN).origin;
  } catch {
    return DEFAULT_LOGO_ORIGIN;
  }
};

/** 只代理我们自己的版本化 Logo 对象；这条 API 不能成为任意 URL 的 SSRF 入口。 */
function isAllowedLogoSource(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.origin === configuredLogoOrigin() &&
      /^\/logos\/brandfetch-v(?:3|4)\//.test(url.pathname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get('src') ?? '';
  if (!isAllowedLogoSource(src)) {
    return NextResponse.json({ error: 'Invalid logo source' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(src, {
      cache: 'force-cache',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Logo source unavailable' }, { status: 502 });
    }

    const contentType = (upstream.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const declaredLength = Number(upstream.headers.get('content-length') ?? '0');
    if (!ALLOWED_CONTENT_TYPES.has(contentType) || declaredLength > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Unsupported logo response' }, { status: 415 });
    }

    const body = await upstream.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Logo response too large' }, { status: 413 });
    }

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Logo fetch failed' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
