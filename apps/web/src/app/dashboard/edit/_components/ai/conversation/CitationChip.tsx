"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import type { CitationSource } from "../types";
import CitationPopover from "./CitationPopover";
import { sourceDomain, sourceHeadline } from "./citationSources";
import SiteFavicon from "./SiteFavicon";

/**
 * The compact citation is deliberately a little taller than the surrounding
 * body copy. The source mark should read as one quiet inline object (like the
 * references in the supplied examples), not as a tiny button with a square
 * corner. Every citation uses the same filled, fully-rounded treatment; a
 * grouped citation only adds the trailing `+N` count.
 */
const CHIP_CLASS =
  "mx-0.5 inline-flex h-5.5 max-w-[13rem] items-center gap-1.5 align-[-1px] text-mr-label-tight leading-none text-mr-ink-secondary transition-[background-color,border-color,color,transform] duration-150";

/**
 * 正文里的一枚引用。
 *
 * 显示这条来源自己的**标题**而不是裸域名：站点归属留给点击后的浮层卡，胶囊只负责让人
 * 在正文里认出这条证据对应的内容。
 *
 * 点击先出浮层卡而不是直接跳转：用户要判断的是「这条值不值得点」，而那需要标题和日期。
 * 原生 `title` 提示做不到——约 1s 延迟、样式不可控、触屏上根本不存在。组里有多条时，
 * 卡片还能就地翻页，不必开一堆标签页再逐个关掉。
 */
export default function CitationChip({
  citations,
  interactive,
}: {
  citations: CitationSource[];
  interactive: boolean;
}) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  const lead = citations[0];
  if (!lead) return null;

  const extra = citations.length - 1;
  const label = sourceHeadline(lead);
  const surfaceClass =
    "rounded-full bg-mr-sunk px-1.5 dark:bg-white/[0.16]";
  const hoverClass = "hover:bg-mr-surface-subtle dark:hover:bg-white/[0.2]";
  const body = (
    <>
      <SiteFavicon
        source={lead}
        className="size-[14px] rounded-full"
        iconSize={8}
      />
      <span className="truncate">{label}</span>
      {extra > 0 ? (
        <span className="shrink-0 tabular-nums text-mr-muted">+{extra}</span>
      ) : null}
    </>
  );

  if (!interactive) {
    return (
      <span
        data-citation-id={lead.citationId}
        title={`${lead.title}${lead.url ? ` · ${sourceDomain(lead.url)}` : ""}`}
        className={`${CHIP_CLASS} ${surfaceClass}`}
      >
        {body}
      </span>
    );
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorRect)}
        aria-label={t("aiLab.sources.count", { count: citations.length })}
        data-citation-id={lead.citationId}
        data-citation-group={citations
          .map((source) => source.citationId)
          .join(",")}
        onClick={() =>
          setAnchorRect((open) =>
            open ? null : (ref.current?.getBoundingClientRect() ?? null),
          )
        }
        className={`${CHIP_CLASS} cursor-pointer ${surfaceClass} ${hoverClass} hover:text-mr-ink active:scale-[0.98]`}
      >
        {body}
      </button>
      {anchorRect ? (
        <CitationPopover
          citations={citations}
          anchorRect={anchorRect}
          onClose={() => setAnchorRect(null)}
        />
      ) : null}
    </>
  );
}
