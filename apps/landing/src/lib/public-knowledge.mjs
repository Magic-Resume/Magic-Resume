import { validDate, httpUrl } from '../../scripts/content-api.mjs';

// Explicit provenance is required. Missing provenance is not proof of consent.
export function publicExemplars(rows) {
  return rows.filter((row) => row && (row.sourceResumeId === null || row.sourceResumeId === '') &&
    row.status === 'active' && typeof row.id === 'string' &&
    typeof row.role === 'string' && row.role.trim() &&
    typeof row.content === 'string' && row.content.trim() &&
    (row.rationale === undefined || row.rationale === null || typeof row.rationale === 'string') &&
    (row.sourceNote === undefined || row.sourceNote === null || typeof row.sourceNote === 'string') &&
    (row.locale === undefined || row.locale === 'en' || row.locale === 'zh'));
}

export function publicTimelines(rows) {
  return rows.filter((row) => row && (row.status === undefined || row.status === 'published') &&
    ['id', 'company', 'season', 'title', 'sourceName'].every((key) => typeof row[key] === 'string' && row[key].trim()) &&
    httpUrl(row.sourceUrl) && validDate(row.updatedAt) &&
    (!row.openAt || validDate(row.openAt)) && (!row.deadlineAt || validDate(row.deadlineAt)));
}

// Stable, URL-safe paths for both English and Chinese role/company names.
export function pathKey(value) {
  return Array.from(value.trim().toLowerCase()).map((char) => /[a-z0-9-]/.test(char) ? char : `~${char.codePointAt(0).toString(16)}~`).join('');
}

export function guidePages(rows) {
  const groups = new Map();
  for (const entry of publicExemplars(rows)) {
    const locale = entry.locale ?? 'zh';
    const role = pathKey(entry.role);
    const key = `${locale}/${role}`;
    if (!groups.has(key)) groups.set(key, { locale, role, title: entry.role, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}

export function campusPages(rows) {
  const groups = new Map();
  for (const entry of publicTimelines(rows)) {
    if (!groups.has(entry.season)) groups.set(entry.season, []);
    groups.get(entry.season).push(entry);
  }
  // W4 launch gate is per season: do not publish a thin or empty directory.
  return [...groups].filter(([, entries]) => new Set(entries.map((entry) => entry.company.trim().toLowerCase())).size >= 30)
    .flatMap(([title, entries]) => {
      const season = pathKey(title);
      const companies = [...new Set(entries.map((entry) => entry.company))];
      return [
        { season, title, entries, company: undefined },
        ...companies.map((company) => ({ season, title: `${company} · ${title}`, company: pathKey(company), entries: entries.filter((entry) => entry.company === company) })),
      ];
    });
}
