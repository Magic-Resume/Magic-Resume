"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ExternalLink, Files, X } from "@magic-resume/icons";
import type { ChatMessage, CitationSource } from "../types";
import {
  internalCitationSources,
  sourceDomain,
  visibleCitationSources,
} from "./citationSources";
import SiteFavicon from "./SiteFavicon";

/** 本轮耗时。轨迹里本来就有，只是从没在用户能看到的地方出现过。 */
function turnDuration(message: ChatMessage): string | null {
  const trajectory = message.trajectory;
  if (!trajectory?.startedAt) return null;
  const end = trajectory.completedAt;
  if (!end) return null;
  const seconds = Math.max(0, Math.round((end - trajectory.startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * 右舷的来源面板——这一轮回答用到的东西。
 *
 * 范围就是**入口所在的那一条回答**：胶囊挂在哪条消息上，面板就是那条消息的账。点某条
 * 却弹出全场，入口和内容就对不上了。
 *
 * 它是右舷的第三位住客，宽度由 `stageIntent` 统一决定（`assist`，与报告画布同宽），
 * 自己不动宽度——右舞台只有一块地方，两层各动一次会把中间的对话列挤到 0 再弹回来。
 */
export default function SourcesPanel({
  message,
  onClose,
}: {
  message: ChatMessage;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const web = visibleCitationSources(message.sources);
  const memory = internalCitationSources(message.sources);
  const duration = turnDuration(message);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-neutral-900/25">
      <div className="flex shrink-0 items-center gap-2 px-5 py-3.5">
        <span className="text-mr-caption font-medium text-mr-ink">
          {t("aiLab.sources.panel.title")}
        </span>
        {duration ? (
          <span className="text-mr-label tabular-nums text-mr-muted">
            {duration}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t("aiLab.sources.panel.close")}
          onClick={onClose}
          className="ml-auto grid size-7 cursor-pointer place-items-center rounded-lg text-mr-muted transition-colors hover:bg-mr-surface-soft hover:text-mr-ink"
        >
          <X size={14} />
        </button>
      </div>

      <div className="scrollbar-hide flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
        {web.length ? (
          <Section label={t("aiLab.sources.panel.web", { count: web.length })}>
            <ol className="flex flex-col">
              {web.map((source, index) => (
                <WebRow key={source.id} source={source} first={index === 0} />
              ))}
            </ol>
          </Section>
        ) : null}

        {memory.length ? (
          <Section
            label={t("aiLab.sources.panel.memory", { count: memory.length })}
          >
            <ol className="flex flex-col">
              {memory.map((source, index) => (
                <MemoryRow
                  key={source.id}
                  source={source}
                  first={index === 0}
                />
              ))}
            </ol>
            <p className="mt-2.5 text-mr-label leading-4 text-mr-muted">
              {t("aiLab.sources.panel.memoryHint")}
            </p>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-mr-label font-medium text-mr-muted">{label}</h3>
      {children}
    </section>
  );
}

/** 条目之间只画横线，不描边成卡。逐条描边在深色底上会连成一张亮网。 */
const ROW_CLASS = "flex min-w-0 flex-col gap-1 py-3";

function WebRow({
  source,
  first,
}: {
  source: CitationSource;
  first: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={first ? "" : "border-t border-mr-line/60"}
    >
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${source.title} · ${t("aiLab.sources.open")}`}
        className={`group/row ${ROW_CLASS} -mx-2 rounded-lg px-2 no-underline transition-colors hover:bg-mr-surface-soft`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <SiteFavicon
            source={source}
            className="size-4 rounded-mr-compact"
            iconSize={9}
          />
          {/* 归属行放域名：标题就在下面一行。 */}
          <span className="min-w-0 truncate text-mr-label-tight text-mr-muted">
            {source.url ? sourceDomain(source.url) : ""}
          </span>
          <span className="ml-auto shrink-0 font-mono text-mr-micro tabular-nums text-mr-muted">
            {source.citationId}
          </span>
          <ExternalLink
            size={11}
            className="shrink-0 text-mr-muted opacity-0 transition-opacity group-hover/row:opacity-100"
          />
        </span>
        <span className="line-clamp-2 text-mr-body-tight font-medium leading-5 text-mr-ink-secondary group-hover/row:text-mr-ink">
          {source.title}
        </span>
        {source.snippet ? (
          <span className="line-clamp-2 text-mr-label-tight leading-4 text-mr-muted">
            {source.snippet}
          </span>
        ) : null}
        {source.publishedDate ? (
          <span className="text-mr-label text-mr-muted">{source.publishedDate}</span>
        ) : null}
      </a>
    </motion.li>
  );
}

/** 记忆条目**没有链接**，所以也不给任何「可点」的手势——不承诺点得开的东西。 */
function MemoryRow({
  source,
  first,
}: {
  source: CitationSource;
  first: boolean;
}) {
  return (
    <li className={first ? "" : "border-t border-mr-line/60"}>
      <div className={ROW_CLASS}>
        <span className="flex min-w-0 items-center gap-1.5 text-mr-muted">
          <span className="grid size-4 shrink-0 place-items-center">
            <Files size={11} />
          </span>
          <span className="min-w-0 truncate text-mr-label-tight">
            {source.sourceName ?? ""}
          </span>
        </span>
        <span className="line-clamp-2 text-mr-body-tight font-medium leading-5 text-mr-ink-secondary">
          {source.title}
        </span>
        {source.snippet ? (
          <span className="line-clamp-2 text-mr-label-tight leading-4 text-mr-muted">
            {source.snippet}
          </span>
        ) : null}
      </div>
    </li>
  );
}
