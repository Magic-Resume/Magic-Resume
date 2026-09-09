"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, ExternalLink } from "@magic-resume/icons";
import type { CitationSource } from "../types";
import { sourceDomain } from "./citationSources";
import SiteFavicon from "./SiteFavicon";

const POPOVER_WIDTH = 300;
const MARGIN = 12;
const GAP = 8;

/**
 * 行内引用的浮层卡。
 *
 * 定位逻辑照搬 `canvas/living/ActionPopover` 已经验证过的那套：量完高度再夹进视口，
 * 装不下就翻到锚点上方。**不要另写一套**——同一个视口夹取问题解两次，必然有一次是错的。
 *
 * 只放「两秒钟决定要不要点」需要的东西：站点、标题、日期。`snippet` 有数据但不放这里，
 * 三行摘要会把它撑成一个小阅读器，那是来源面板的职责。
 */
export default function CitationPopover({
  citations,
  anchorRect,
  onClose,
}: {
  citations: CitationSource[];
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const ref = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const [pos, setPos] = React.useState({
    top: anchorRect.bottom + GAP,
    left: anchorRect.left,
  });

  const total = citations.length;
  const citation = citations[Math.min(index, total - 1)];

  React.useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 140;
    let top = anchorRect.bottom + GAP;
    let left = anchorRect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - MARGIN) {
      left = window.innerWidth - MARGIN - POPOVER_WIDTH;
    }
    left = Math.max(MARGIN, left);
    if (top + height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, anchorRect.top - height - GAP);
    }
    setPos({ top, left });
  }, [anchorRect, index]);

  React.useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      // 组内翻页**不循环**：能走到头，「1/2」这个计数才有意义。
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (event.key === "ArrowRight")
        setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, total]);

  if (!citation) return null;

  const card = (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={citation.title}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="fixed z-[60] overflow-hidden rounded-xl bg-mr-surface shadow-2xl shadow-mr-control"
    >
      {total > 1 ? (
        <div className="flex items-center justify-between bg-mr-sunk px-2 py-1.5">
          <span className="flex items-center gap-0.5">
            <PageButton
              label={t("aiLab.sources.prev")}
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft size={13} />
            </PageButton>
            <PageButton
              label={t("aiLab.sources.next")}
              disabled={index === total - 1}
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            >
              <ArrowRight size={13} />
            </PageButton>
          </span>
          <span className="pr-1 text-mr-label tabular-nums text-mr-muted">
            {t("aiLab.sources.position", { index: index + 1, total })}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 p-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <SiteFavicon
            source={citation}
            className="size-4 rounded-mr-compact"
            iconSize={9}
          />
          {/* 归属行放域名：标题就在下面一行，两处都写标题等于说了两遍。 */}
          <span className="min-w-0 truncate text-mr-label-tight text-mr-muted">
            {citation.url ? sourceDomain(citation.url) : ""}
          </span>
        </span>
        <span className="line-clamp-2 text-mr-body-tight font-medium leading-5 text-mr-ink">
          {citation.title}
        </span>
        <span className="flex items-center justify-between gap-2 pt-0.5">
          <span className="min-w-0 truncate text-mr-label text-mr-muted">
            {citation.publishedDate ?? ""}
          </span>
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-mr-label-tight text-mr-accent-ink no-underline transition-colors hover:bg-mr-surface-soft"
          >
            {t("aiLab.sources.open")}
            <ExternalLink size={11} />
          </a>
        </span>
      </div>
    </motion.div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(card, document.body);
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-md text-mr-muted transition-colors hover:bg-mr-surface-soft hover:text-mr-ink disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
