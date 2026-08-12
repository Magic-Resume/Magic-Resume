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
  /** 角标底色的工具类，如 `bg-red`。 */
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
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline tabular-nums">
          {CHUNKS.length}
        </span>
      </div>

      {CHUNKS.map((chunk, i) => (
        <div
          key={chunk.title}
          className="overflow-hidden rounded-card bg-surface shadow-card"
          style={{
            animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 100}ms both`,
          }}
        >
          <div className="primitive-card-bar flex items-center gap-2.5 border-b border-line">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
              <span className="truncate">{chunk.title}</span>
            </span>
            <span className="ml-auto shrink-0 text-[12px] text-ink-3 tabular-nums">{chunk.chars}</span>
          </div>
          <p className="px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2">
            {chunk.body}
          </p>
          <div className="px-3 pb-3">
            <span
              className="inline-flex h-6 items-center gap-1.5 rounded-full bg-inset px-2
                text-[12px] font-medium text-ink-2 shadow-btn
                transition-[opacity,transform,background-color] duration-300 hover:bg-hover"
              style={{
                opacity: chipsShown ? 1 : 0,
                transform: chipsShown ? "scale(1)" : "scale(0.95)",
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <span className={`flex size-3.5 items-center justify-center rounded-[4px] ${chunk.tone} text-[7px] font-bold text-[#fff]`}>
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
