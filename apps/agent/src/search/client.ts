import { Readable } from 'node:stream';
import type { SearchConfiguration, Settings } from '../config.js';
import { AgentError } from '../contracts/errors.js';
import { collectLimited } from '../document/input.js';
import {
  createModelTransport,
  type ModelResolver,
} from '../model/transport.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedDate?: string;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit: number) =>
  typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, limit)
    : '';

export function normalizeSearchResults(
  provider: SearchConfiguration['provider'],
  body: unknown,
  count: number,
): SearchResult[] {
  const raw = record(body);
  const items = provider === 'brave' ? record(raw.web).results : raw.results;
  if (!Array.isArray(items))
    throw new AgentError(
      502,
      'upstream_unavailable',
      'search_response_invalid',
    );
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const source = record(item);
    try {
      const url = new URL(String(source.url ?? ''));
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.href.length > 8192
      )
        continue;
      url.hash = '';
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      const sourceName = url.hostname.replace(/^www\./, '');
      const title = text(source.title, 300) || sourceName;
      const snippet = text(
        provider === 'brave' ? source.description : source.content,
        1200,
      );
      const date = text(
        source.published_date ?? source.publishedDate ?? source.page_age,
        100,
      );
      results.push({
        title,
        url: url.href,
        snippet,
        sourceName,
        ...(date ? { publishedDate: date } : {}),
      });
      if (results.length >= count) break;
    } catch {
      /* Invalid result links cannot become clickable sources. */
    }
  }
  return results;
}

export async function searchWeb(
  configuration: SearchConfiguration,
  query: string,
  count: number,
  settings: Settings,
  signal: AbortSignal,
  resolver?: ModelResolver,
): Promise<SearchResult[]> {
  const { provider, baseUrl, apiKey } = configuration;
  const url = new URL(
    `${baseUrl}/${provider === 'brave' ? 'web/search' : 'search'}`,
  );
  const headers = new Headers({ Accept: 'application/json' });
  let body: string | undefined;
  if (provider === 'tavily') {
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify({
      query,
      max_results: count,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    });
  } else {
    url.searchParams.set('q', query);
    if (provider === 'brave') {
      headers.set('X-Subscription-Token', apiKey!);
      url.searchParams.set('count', String(count));
      url.searchParams.set('text_decorations', 'false');
    } else url.searchParams.set('format', 'json');
  }
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.min(settings.runTimeoutMs, 30_000)),
  ]);
  let transport: Awaited<ReturnType<typeof createModelTransport>> | undefined;
  let response: Response | undefined;
  try {
    transport = await createModelTransport(
      url.href,
      settings.allowPrivateModelHosts,
      deadline,
      resolver,
      settings.idleTimeoutMs,
      'search',
    );
    response = await transport.fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
      signal: deadline,
    });
    if (!response.ok)
      throw new AgentError(
        502,
        'upstream_unavailable',
        response.status === 401 || response.status === 403
          ? 'search_key_rejected'
          : response.status === 429
            ? 'search_rate_limited'
            : 'search_request_failed',
      );
    if (
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .includes('application/json') ||
      !response.body
    )
      throw new AgentError(
        502,
        'upstream_unavailable',
        'search_response_invalid',
      );
    const declared = Number(response.headers.get('content-length'));
    if (declared > 2_097_152)
      throw new AgentError(
        502,
        'upstream_unavailable',
        'search_response_too_large',
      );
    const bytes = await collectLimited(
      Readable.fromWeb(
        response.body as import('node:stream/web').ReadableStream<Uint8Array>,
      ),
      2_097_152,
      deadline,
    );
    return normalizeSearchResults(
      provider,
      JSON.parse(bytes.toString('utf8')),
      count,
    );
  } catch (error) {
    signal.throwIfAborted();
    if (
      error instanceof AgentError &&
      error.payload.subCode.startsWith('search_')
    )
      throw error;
    throw new AgentError(
      502,
      'upstream_unavailable',
      deadline.aborted ? 'search_timeout' : 'search_request_failed',
    );
  } finally {
    await response?.body?.cancel().catch(() => {});
    await transport?.close();
  }
}
