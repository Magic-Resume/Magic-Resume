"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────────────────
 * SEARCH — command search with live filtering.
 * The field, clear action, and results are directly usable.
 * ───────────────────────────────────────────────────────── */

/** 命令式搜索列表。条目就是一行文本；原版写死 `ITEMS`，现在由调用方给。 */
export default function SearchList({
  items: ITEMS,
  placeholder = "Search…",
}: {
  items: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const results = query
    ? ITEMS.filter((i) => i.toLowerCase().includes(query.toLowerCase()))
    : ITEMS.slice(0, 5);
  const empty = query.length > 2 && results.length === 0;

  return (
    <div className="flex min-h-[248px] w-full max-w-72 flex-col items-stretch">
      <div className="w-full self-start overflow-hidden rounded-mr-card bg-mr-surface shadow-mr-panel">
        {/* input row */}
        <div className="flex h-10 items-center gap-2 border-b border-mr-line px-3 transition-colors duration-100 hover:bg-mr-surface-soft">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mr-muted)" strokeWidth="2" strokeLinecap="round" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-mr-caption text-mr-ink outline-none placeholder:text-mr-muted"
          />
          {query && (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => setQuery("")}
              className="flex size-5.5 items-center justify-center rounded-full text-mr-muted
                transition-colors duration-100 hover:bg-mr-line/70 hover:text-mr-ink"
              style={{ animation: "fade-in 150ms ease-out both" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* results / empty state */}
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8" style={{ animation: "fade-in 250ms ease-out both" }}>
            <span className="mb-1.5 flex size-8 items-center justify-center rounded-mr-control bg-mr-sunk text-mr-muted shadow-mr-control">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <span className="text-mr-caption font-medium text-mr-ink">No results found</span>
            <span className="text-mr-overline text-mr-muted">Adjust your search to try again</span>
          </div>
        ) : (
          <div className="p-1">
            {results.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuery(item)}
                className="flex h-8 w-full items-center rounded-md px-2 text-left text-mr-caption
                  text-mr-ink transition-colors duration-100 hover:bg-mr-surface-soft"
                style={{ animation: "fade-in 200ms ease-out both" }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
