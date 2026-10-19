/** Core's public lists use { items, total, current, size }, optionally in data. */
export async function fetchPages(endpoint, { headers = {}, fetchImpl = fetch, pageCap = 100, size = 100 } = {}) {
  const rows = [];
  let total;
  for (let current = 1; current <= pageCap; current++) {
    const url = new URL(endpoint);
    url.searchParams.set('current', String(current));
    url.searchParams.set('size', String(size));
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const page = payload?.data ?? payload;
    if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 ||
        page.current !== current || !Number.isSafeInteger(page.size) || page.size < 1 ||
        page.items.length > page.size) throw new Error('invalid pagination envelope');
    if (total !== undefined && total !== page.total) throw new Error('corpus changed during pagination');
    total = page.total;
    rows.push(...page.items);
    if (rows.length > total) throw new Error('pagination exceeded total');
    if (rows.length === total) return rows;
    if (page.items.length === 0) throw new Error('pagination ended before total');
  }
  throw new Error(`pagination exceeded ${pageCap} pages`);
}

export const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));
export const httpUrl = (value) => {
  try { return typeof value === 'string' && ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};
