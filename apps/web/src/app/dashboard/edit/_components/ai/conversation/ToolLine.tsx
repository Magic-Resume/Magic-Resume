"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, GlobeIcon } from "@magic-resume/icons";
import { Icon } from "@magic-resume/genui";
import type { CitationSource, ToolCall } from "../types";
import { toToolChipRows } from "./toolTrace";
import { sourceHeadline, sourcesForToolCall } from "./citationSources";
import SiteFavicon from "./SiteFavicon";
import AgentDisclosure from "./AgentDisclosure";

/** 折叠行左侧最多叠几枚站点图标。再多只是一团重叠的圆。 */
const MAX_STACKED_FAVICONS = 3;

/**
 * 一次工具调用，平铺一行。
 *
 * 刻意**不折叠**：此前整轮工具收在一个「2 次工具调用」的按钮后面，默认关着——用户要多点
 * 一次才知道刚才发生了什么，而那正是他最想知道的东西。过程是旁白的一部分，不是附录。
 *
 * 搜索是唯一例外：它有查询词和一串站点要交代，那些值得一次点击（见 `SearchLine`）。
 */
export default function ToolLine({
  call,
  sources = [],
}: {
  call: ToolCall;
  sources?: CitationSource[];
}) {
  const { t } = useTranslation();
  const [row] = toToolChipRows([call], t);
  if (!row) return null;
  if (isSearch(call)) return <SearchLine call={call} sources={sources} />;

  const running = !call.done;
  return (
    <div className="flex min-w-0 items-center gap-2 py-1 text-mr-ui">
      <span
        className={`grid size-4 shrink-0 place-items-center ${
          running ? "text-neutral-400" : "text-neutral-600"
        }`}
      >
        <Icon name={row.icon} />
      </span>
      <span
        className={`shrink-0 font-medium text-neutral-400 ${
          running ? "ai-narrate" : ""
        }`}
      >
        {row.label}
      </span>
      {row.chip ? (
        <span className="min-w-0 truncate rounded-chip bg-mr-surface-muted px-1.5 py-0.5 text-mr-label-tight text-neutral-400">
          {row.chip}
        </span>
      ) : null}
      {row.detail?.[0] ? (
        <span className="min-w-0 truncate text-mr-label-tight text-neutral-500">
          {row.detail[0].text}
        </span>
      ) : null}
    </div>
  );
}

function isSearch(call: ToolCall): boolean {
  return call.summary?.verb === "search" || call.toolName === "web_search";
}

type SearchOutcome =
  | { kind: "counted"; count: number }
  | { kind: "empty" }
  | { kind: "unavailable" }
  | { kind: "quota" }
  | { kind: "failed" };

/**
 * 工具的 `status` 分成用户看得懂的几类。
 *
 * 这些状态一直躺在 `web_search` 的返回 JSON 里没人读，于是「今天额度用完了」在用户眼里
 * 是一行「正在搜索网页」然后什么都没有——最伤信任的那种失败，静默的。
 */
const QUOTA_STATUSES = new Set([
  "quota_unavailable",
  "daily_limit_exhausted",
  "insufficient_credits",
  "credits_unavailable",
  "run_limit_exhausted",
]);
const UNAVAILABLE_STATUSES = new Set([
  "unavailable",
  "provider_unavailable",
  "deep_search_unavailable",
]);
const EMPTY_STATUSES = new Set(["empty", "deep_search_empty"]);

function searchOutcome(call: ToolCall, count: number): SearchOutcome {
  if (call.error) return { kind: "failed" };
  const status = call.searchStatus;
  if (status && QUOTA_STATUSES.has(status)) return { kind: "quota" };
  if (status && UNAVAILABLE_STATUSES.has(status)) return { kind: "unavailable" };
  if (status && EMPTY_STATUSES.has(status)) return { kind: "empty" };
  return { kind: "counted", count };
}

/**
 * 一次搜索。
 *
 * 措辞随掌握的信息递进：先「正在搜索网页」，来源到了变成「正在搜索 N 个网站」，跑完换
 * 过去时。一个从头到尾不变的「搜索中」证明不了任何事——之前这一行正是如此，连读完的
 * 历史消息里都还写着「正在搜索」。
 *
 * 计数与站点都只算**这一次**调用（`call.citationIds`）。读整条消息合并后的来源，会让
 * 一轮里的两次搜索显示同一个数字、同一批图标。
 */
function SearchLine({
  call,
  sources,
}: {
  call: ToolCall;
  sources: CitationSource[];
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const contentId = React.useId();
  const [open, setOpen] = React.useState(false);

  const running = !call.done;
  const mine = sourcesForToolCall(sources, call);
  const query = (call.summary?.subject ?? call.subject ?? "").trim();
  const outcome = searchOutcome(call, mine.length);
  const deep = call.searchStatus?.startsWith("deep_search") ?? false;
  const partial = call.searchStatus === "deep_search_partial";

  const label = (() => {
    if (outcome.kind === "failed") return t("aiLab.search.failed");
    if (outcome.kind === "quota") return t("aiLab.search.quota");
    if (outcome.kind === "unavailable") return t("aiLab.search.unavailable");
    if (outcome.kind === "empty") return t("aiLab.search.empty");
    if (outcome.count === 0) return t("aiLab.tools.searchingWeb");
    if (running)
      return t("aiLab.tools.searchingSites", { count: outcome.count });
    return deep
      ? t("aiLab.search.deepDone", { count: outcome.count })
      : t("aiLab.tools.searchedSites", { count: outcome.count });
  })();

  // provider 压根没被调用时展开区里没有一件可交代的事，查询词也说明不了什么。
  const expandable =
    outcome.kind !== "unavailable" && Boolean(query || mine.length);

  const head = (
    <>
      {mine.length ? (
        <span className="flex shrink-0 -space-x-1" aria-hidden="true">
          {mine.slice(0, MAX_STACKED_FAVICONS).map((source) => (
            <SiteFavicon
              key={source.id}
              source={source}
              className="size-[18px] rounded-full border border-mr-line-strong"
              iconSize={9}
            />
          ))}
        </span>
      ) : (
        <span
          className={`grid size-4 shrink-0 place-items-center ${
            running ? "text-neutral-400" : "text-neutral-600"
          }`}
          aria-hidden="true"
        >
          <GlobeIcon width={13} height={13} />
        </span>
      )}
      <span
        className={`min-w-0 truncate font-medium text-neutral-400 ${
          running ? "ai-narrate" : ""
        }`}
      >
        {label}
        {partial ? ` ${t("aiLab.search.partial")}` : ""}
      </span>
    </>
  );

  return (
    <div className="text-mr-ui">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={t("aiLab.search.toggle")}
          onClick={() => setOpen((value) => !value)}
          className="group flex min-w-0 max-w-full items-center gap-2 rounded-md py-1 text-left"
        >
          {head}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            className="inline-flex shrink-0 text-neutral-600 group-hover:text-neutral-400"
          >
            <ChevronDown size={12} />
          </motion.span>
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2 py-1">{head}</div>
      )}

      {expandable ? (
        <AgentDisclosure id={contentId} role="region" open={open}>
          <div className="flex flex-col gap-1.5 pb-1.5 pl-6">
            {query ? (
              <span className="min-w-0 text-mr-ui leading-5 text-mr-ink-secondary [overflow-wrap:anywhere]">
                {t("aiLab.search.queryQuoted", { query })}
              </span>
            ) : null}
            {mine.length ? (
              <span className="flex flex-wrap gap-1.5">
                {mine.map((source) => (
                  <SourcePill key={source.id} source={source} />
                ))}
              </span>
            ) : null}
          </div>
        </AgentDisclosure>
      ) : null}
    </div>
  );
}

/** 展开区里的一条结果。胶囊本身就是链接——它已经在上下文里，不必再借一层浮层。 */
function SourcePill({ source }: { source: CitationSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title}
      className="inline-flex h-6 max-w-[14rem] items-center gap-1.5 rounded-full bg-mr-sunk px-1.5 text-mr-label-tight text-mr-ink-secondary no-underline shadow-mr-control transition-[background-color,color,transform] duration-150 hover:bg-mr-surface-soft hover:text-mr-ink active:scale-[0.98]"
    >
      <SiteFavicon
        source={source}
        className="size-[14px] rounded-full"
        iconSize={8}
      />
      <span className="truncate">{sourceHeadline(source)}</span>
    </a>
  );
}
