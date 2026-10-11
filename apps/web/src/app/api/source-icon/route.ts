const MAX_ICON_BYTES = 256 * 1024;
const ICON_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Fixed icon service only; the supplied domain is never an outbound fetch target. */
export async function GET(request: Request) {
  const domain =
    new URL(request.url).searchParams.get('domain')?.toLowerCase() ?? '';
  if (
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
    /\.(?:localhost|local|internal|invalid|test)$/.test(domain)
  )
    return new Response(null, { status: 400 });

  try {
    const upstream = await fetch(
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      {
        cache: 'force-cache',
        next: { revalidate: 86_400 },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      },
    );
    const type = (upstream.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!upstream.ok || !ICON_TYPES.has(type))
      return new Response(null, { status: 404 });
    if (Number(upstream.headers.get('content-length')) > MAX_ICON_BYTES) {
      await upstream.body?.cancel();
      return new Response(null, { status: 413 });
    }
    const body = await upstream.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_ICON_BYTES)
      return new Response(null, { status: 413 });
    return new Response(body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
