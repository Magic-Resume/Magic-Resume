"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@magic-resume/genui/beautiful";
import type { CitationSource, ToolCall } from "../types";
import { toToolChipRows } from "./toolTrace";
import { visibleCitationSources } from "./citationSources";
import SiteFavicon from "./SiteFavicon";

/** 一次搜索最多亮几个站点图标，多的收进「+N」。 */
const MAX_FAVICONS = 4;

/**
 * 一次工具调用，平铺一行。
 *
 * 刻意**不折叠**：此前整轮工具收在一个「2 次工具调用」的按钮后面，默认关着——用户要多点
 * 一次才知道刚才发生了什么，而那正是他最想知道的东西。过程是旁白的一部分，不是附录。
 *
 * 摘要也直接跟在同一行末尾，不再藏进展开区：一行里说得完的事不值得一次点击。
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

  const running = !call.done;
  const search = describeSearch(call, sources, t);

  return (
    <div className="flex min-w-0 items-center gap-2 py-1 text-[12.5px]">
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
        {search?.label ?? row.label}
      </span>
      {search ? (
        <span className="flex shrink-0 items-center gap-1">
          {search.sources.slice(0, MAX_FAVICONS).map((source) => (
            <SiteFavicon key={source.id} source={source} />
          ))}
          {search.sources.length > MAX_FAVICONS ? (
            <span className="text-[11px] tabular-nums text-neutral-500">
              +{search.sources.length - MAX_FAVICONS}
            </span>
          ) : null}
        </span>
      ) : (
        <>
          {row.chip ? (
            <span className="min-w-0 truncate rounded-chip bg-white/[0.05] px-1.5 py-0.5 text-[11.5px] text-neutral-400">
              {row.chip}
            </span>
          ) : null}
          {row.detail?.[0] ? (
            <span className="min-w-0 truncate text-[11.5px] text-neutral-500">
              {row.detail[0].text}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * 搜索这一行的措辞随掌握的信息变具体：先「正在搜索网页」，等来源到了就变成
 * 「正在搜索 N 个网站」并把站点图标亮出来。
 *
 * 一个从头到尾不变的「搜索中」证明不了任何事；换成真实域名的图标，用户才看得出它确实
 * 在碰外面的世界，而不是在转圈。
 */
function describeSearch(
  call: ToolCall,
  sources: CitationSource[],
  t: (key: string, options?: Record<string, unknown>) => string,
): { label: string; sources: CitationSource[] } | null {
  const isSearch =
    call.summary?.verb === "search" || call.toolName === "web_search";
  if (!isSearch) return null;
  const visible = visibleCitationSources(sources);
  if (!visible.length) return { label: t("aiLab.tools.searchingWeb"), sources: [] };
  return {
    label: t("aiLab.tools.searchingSites", { count: visible.length }),
    sources: visible,
  };
}
