/** The full cutoff day is grandfathered; new publications AND revisions need sources.
 * @param {{ datePublished: string | Date, dateModified: string | Date, sources?: unknown[] }} article
 */
export function hasRequiredSources(article) {
  const cutoff = Date.parse('2026-10-15T00:00:00Z');
  const needsSources = [article.datePublished, article.dateModified]
    .some((date) => new Date(date).getTime() >= cutoff);
  return !needsSources || (article.sources?.length ?? 0) >= 1;
}
