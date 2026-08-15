import type { CitationSource } from "../types";

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parsedToolOutput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return recordOf(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  const direct = recordOf(value);
  if (!direct) return undefined;
  if (Array.isArray(direct.results)) return direct;
  if (typeof direct.content === "string") {
    return parsedToolOutput(direct.content);
  }
  if (Array.isArray(direct.content)) {
    for (const part of direct.content) {
      const record = recordOf(part);
      const parsed = parsedToolOutput(record?.text ?? record?.content ?? part);
      if (parsed) return parsed;
    }
  }
  return undefined;
}

/** SSE 是运行时边界：坏来源宁可丢掉，也不能把任意协议塞进可点击链接。 */
export function normalizeCitationSources(value: unknown): CitationSource[] {
  if (!Array.isArray(value)) return [];
  const out: CitationSource[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const source = raw as Record<string, unknown>;
    const kind =
      source.kind === "internal"
        ? "internal"
        : source.kind === "external"
          ? "external"
          : null;
    const visibility =
      source.visibility === "hidden"
        ? "hidden"
        : source.visibility === "visible"
          ? "visible"
          : null;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    const title =
      typeof source.title === "string" ? source.title.trim().slice(0, 300) : "";
    if (!kind || !visibility || !id || !title) continue;
    const url = httpUrl(source.url);
    // 可见外部来源必须真的有安全 URL；否则来源胶囊会成为一个点不开的承诺。
    if (kind === "external" && visibility === "visible" && !url) continue;
    const rawCitationId = source.citationId;
    const citationId =
      typeof rawCitationId === "number" &&
      Number.isInteger(rawCitationId) &&
      rawCitationId > 0
        ? rawCitationId
        : undefined;
    const optionalText = (field: string, max: number) =>
      typeof source[field] === "string"
        ? (source[field] as string).trim().slice(0, max) || undefined
        : undefined;
    const snippet = optionalText("snippet", 1_200);
    const publishedDate = optionalText("publishedDate", 100);
    const sourceName = optionalText("sourceName", 200);
    const faviconUrl = httpUrl(source.faviconUrl);
    out.push({
      id,
      kind,
      visibility,
      title,
      ...(citationId ? { citationId } : {}),
      ...(url ? { url } : {}),
      ...(snippet ? { snippet } : {}),
      ...(publishedDate ? { publishedDate } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(faviconUrl ? { faviconUrl } : {}),
    });
  }
  return out;
}

/**
 * Compatibility path for an agent-service that only sent `tool_result`.
 * The direct `source_update` event remains authoritative, but recovering the
 * validated web-search payload here prevents old/mixed deployments from
 * leaving naked [n] markers in a new frontend.
 */
export function citationSourcesFromWebSearchToolResult(
  value: unknown,
): CitationSource[] {
  const output = parsedToolOutput(value);
  const results = Array.isArray(output?.results) ? output.results : [];
  const candidates = results.map((raw, index) => {
    const result = recordOf(raw) ?? {};
    const rawId = result.citationId;
    const citationId =
      typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0
        ? rawId
        : index + 1;
    const url = httpUrl(result.url);
    const title =
      typeof result.title === "string" && result.title.trim()
        ? result.title.trim()
        : url
          ? sourceDomain(url)
          : "";
    return {
      id: `external:${citationId}`,
      kind: "external",
      visibility: "visible",
      citationId,
      title,
      url,
      snippet: result.snippet,
      publishedDate: result.publishedDate,
      faviconUrl: result.faviconUrl,
    };
  });
  return normalizeCitationSources(candidates);
}

export function mergeCitationSources(
  current: CitationSource[] = [],
  incoming: CitationSource[] = [],
): CitationSource[] {
  const merged = new Map<string, CitationSource>();
  for (const source of [...current, ...incoming]) {
    const key = source.id || `${source.kind}:${source.url ?? source.title}`;
    merged.set(key, { ...merged.get(key), ...source });
  }
  return [...merged.values()];
}

/** 内部来源已进统一模型，但按产品决定暂不展示。 */
export function visibleCitationSources(
  sources: CitationSource[] = [],
): CitationSource[] {
  return sources
    .filter(
      (source) =>
        source.kind === "external" &&
        source.visibility === "visible" &&
        source.url &&
        source.citationId,
    )
    .sort((a, b) => (a.citationId ?? 0) - (b.citationId ?? 0));
}

export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Provider 没给图标时只推导站点同源的标准路径，不在服务端抓取任意网页。
 * 候选值和页面 URL 都只允许 http(s)，避免把 data:/javascript: 带进图片节点。
 */
export function siteFaviconUrl(
  pageUrl: string | undefined,
  candidate?: string,
): string | undefined {
  const supplied = httpUrl(candidate);
  if (supplied) return supplied;
  const page = httpUrl(pageUrl);
  if (!page) return undefined;
  try {
    return new URL("/favicon.ico", page).toString();
  } catch {
    return undefined;
  }
}

export function citationAnchor(
  citationId: number,
  available = true,
): string {
  return available
    ? `#citation-${citationId}`
    : `#citation-missing-${citationId}`;
}

export function citationGroupAnchor(
  citationIds: number[],
  available = true,
): string {
  const suffix = citationIds.join("-");
  return available
    ? `#citations-${suffix}`
    : `#citations-missing-${suffix}`;
}

/**
 * 把模型输出的裸 `[n]` 变成内部 Markdown 链接；代码围栏、行内代码和已有链接不动。
 *
 * 链接只承担「让 react-markdown 产出一个可定制节点」的职责，真正跳转的 URL 仍只从
 * 已校验的 sources 读取。即使来源事件比正文晚到，或历史消息没有保存来源，数字也会先
 * 渲染成明确的缺失态，而不是泄漏一串原始 `[4][9]`。
 */
export function linkCitationMarkers(
  markdown: string,
  sources: CitationSource[] = [],
): string {
  if (!markdown.includes("[")) return markdown;
  const sourceById = new Map(
    visibleCitationSources(sources).flatMap((source) =>
      source.citationId ? [[source.citationId, source] as const] : [],
    ),
  );

  const groupedLinks = (citationIds: number[]) => {
    const groups: Array<{
      key: string;
      available: boolean;
      citationIds: number[];
    }> = [];
    for (const citationId of citationIds) {
      const source = sourceById.get(citationId);
      const key = source?.url
        ? `domain:${sourceDomain(source.url)}`
        : "missing";
      const previous = groups[groups.length - 1];
      if (previous?.key === key) {
        if (!previous.citationIds.includes(citationId)) {
          previous.citationIds.push(citationId);
        }
      } else {
        groups.push({
          key,
          available: Boolean(source?.url),
          citationIds: [citationId],
        });
      }
    }
    return groups
      .map((group) => {
        const label = group.citationIds.join(",");
        const href =
          group.citationIds.length === 1
            ? citationAnchor(group.citationIds[0], group.available)
            : citationGroupAnchor(group.citationIds, group.available);
        return `[${label}](${href})`;
      })
      .join("");
  };

  let fence: { char: "`" | "~"; size: number } | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        const char = marker[0] as "`" | "~";
        if (!fence) fence = { char, size: marker.length };
        else if (fence.char === char && marker.length >= fence.size)
          fence = null;
        return line;
      }
      if (fence) return line;

      return line
        .split(/(`+[^`]*`+)/g)
        .map((part) => {
          if (part.startsWith("`")) return part;
          return part.replace(
            /\[(\d+)\](?![ \t]*(?:\(|:))(?:[ \t]*\[(\d+)\](?![ \t]*(?:\(|:)))*/g,
            (whole, _first: string, _last: string, offset: number) => {
              if (part[offset - 1] === "!") return whole;
              const citationIds = [...whole.matchAll(/\[(\d+)\]/g)].map(
                (match) => Number(match[1]),
              );
              return citationIds.length > 0 &&
                citationIds.every(
                  (citationId) =>
                    Number.isSafeInteger(citationId) && citationId > 0,
                )
                ? groupedLinks(citationIds)
                : whole;
            },
          );
        })
        .join("");
    })
    .join("\n");
}
