"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * CONTEXT CARDS
 * Retrieved chunks enter once, then remain available.
 * ───────────────────────────────────────────────────────── */

export interface ContextChunk {
  title: string;
  /** 体量说明，如「290 characters」。 */
  chars: string;
  body: string;
  /** 来源文件名。 */
  source: string;
  /** 类型角标，如 PDF / CSV。 */
  badge: string;
  /** 角标底色的工具类，如 `bg-mr-danger`。 */
  tone: string;
}

/** 检索到的知识块。原版写死 `CHUNKS`，现在由调用方给。 */
export default function ContextCards({
  chunks: CHUNKS,
  title = "Sources",
}: {
  chunks: ContextChunk[];
  /** 标题栏文案，走调用方的 i18n。 */
  title?: string;
}) {
  const [chipsShown, setChipsShown] = useState(false);

  useEffect(() => {
    const chips = setTimeout(() => setChipsShown(true), 700);
    return () => clearTimeout(chips);
  }, []);

  return (
    <div className="flex w-full max-w-95 flex-col gap-2">
      <div
        className="flex items-center gap-2 px-0.5"
        style={{ animation: "fade-in 400ms ease-out both" }}
      >
        <span className="text-mr-caption font-semibold text-mr-ink">{title}</span>
        <span className="inline-flex h-5 items-center rounded-md bg-mr-sunk px-1.5 text-mr-label-tight font-medium text-mr-ink-secondary shadow-mr-control tabular-nums">
          {CHUNKS.length}
        </span>
      </div>

      {CHUNKS.map((chunk, i) => (
        <div
          key={chunk.title}
          className="overflow-hidden rounded-mr-card bg-mr-surface shadow-mr-panel"
          style={{
            animation: `fade-up 400ms var(--narrate-ease) ${i * 100}ms both`,
          }}
        >
          <div className="primitive-card-bar flex items-center gap-2.5 border-b border-mr-line">
            <span className="flex min-w-0 items-center gap-1.5 text-mr-caption font-medium text-mr-ink">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              <span className="truncate">{chunk.title}</span>
            </span>
            <span className="ml-auto shrink-0 text-mr-overline text-mr-muted tabular-nums">{chunk.chars}</span>
          </div>
          <p className="px-3 pt-2 pb-1 text-mr-ui leading-relaxed text-mr-ink-secondary">
            {chunk.body}
          </p>
          <div className="px-3 pb-3">
            <span
              className="inline-flex h-6 items-center gap-1.5 rounded-full bg-mr-sunk px-2
                text-mr-overline font-medium text-mr-ink-secondary shadow-mr-control
                transition-[opacity,transform,background-color] duration-300 hover:bg-mr-surface-soft"
              style={{
                opacity: chipsShown ? 1 : 0,
                transform: chipsShown ? "scale(1)" : "scale(0.95)",
                transitionTimingFunction: "var(--narrate-ease)",
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <span className={`flex size-3.5 items-center justify-center rounded ${chunk.tone} text-[7px] font-bold text-[#fff]`}>
                {chunk.badge}
              </span>
              {chunk.source}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
