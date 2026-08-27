"use client";

import React from "react";
import { Telescope } from "@magic-resume/icons";
import { useTranslation } from "react-i18next";
import { WidgetItem, WidgetShell } from "@magic-resume/genui";
import type { WidgetProps } from "@magic-resume/genui/contract";
import Markdown from "../conversation/Markdown";

type Group = {
  key: string;
  title?: string;
  items: string[];
  accent: string;
  actionable?: boolean;
};

/**
 * 岗位研究的结构化产出。
 *
 * 这是后端最结构化的一份结果，此前却完全没有 UI：要么落成聊天里一大段 Markdown，
 * 要么写进用户永远打不开的 `/workspace/job-research.md`。清单形状的东西就该长成清单。
 *
 * `evidence_to_add`（该补什么证据）和 `recruiter_questions`（该问 HR 什么）是可执行的，
 * 点一条就把它变成下一轮对话，而不是让用户照着重打一遍。
 */
export default function JobResearchCard({
  instance,
  onAction,
  context,
}: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    jobTitle?: string;
    groups?: Group[];
  };
  const groups = props.groups ?? [];
  const sources = context?.sources ?? [];
  if (!groups.length) return null;

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-tint-sky">
          <Telescope size={14} className="text-ink-sky" />
        </div>
        <span className="text-[13px] font-medium text-primary truncate">
          {props.jobTitle || t("aiLab.widgets.research.title")}
        </span>
      </div>

      <div className="mt-3 space-y-3.5">
        {groups.map((g) => (
          <WidgetItem key={g.key}>
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="h-3 w-1 rounded-full"
                style={{ background: g.accent }}
              />
              <span className="text-[11px] font-medium text-secondary">
                {g.title ||
                  t(`aiLab.widgets.research.groups.${g.key}`, {
                    defaultValue: g.key,
                  })}
              </span>
            </div>
            <ul className="space-y-1 pl-3">
              {g.items.map((item) =>
                g.actionable ? (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() =>
                        onAction({
                          type: "submit",
                          values: {
                            follow_up: t("aiLab.widgets.research.followUp", {
                              item,
                            }),
                          },
                        })
                      }
                      className="w-full rounded-md px-1 py-0.5 text-left text-xs leading-relaxed text-secondary transition-colors hover:bg-sunk hover:text-primary cursor-pointer"
                    >
                      <Markdown
                        sources={sources}
                        interactiveLinks={false}
                        inline
                      >
                        {item}
                      </Markdown>
                    </button>
                  </li>
                ) : (
                  <li
                    key={item}
                    className="text-xs leading-relaxed text-secondary"
                  >
                    <Markdown sources={sources} inline>
                      {item}
                    </Markdown>
                  </li>
                ),
              )}
            </ul>
          </WidgetItem>
        ))}
      </div>
    </WidgetShell>
  );
}
