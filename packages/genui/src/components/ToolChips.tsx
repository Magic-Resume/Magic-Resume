"use client";

import { useState } from "react";
import { Icon } from "./icons";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS
 * An agent run as compact rows: tool calls with inline
 * chips, then file-diff chips summarizing the edits.
 * Hover a row to reveal its chevron; every row expands
 * to show what the tool actually did.
 * ───────────────────────────────────────────────────────── */


type DetailLine = { text: string; tone?: "add" };

export type ToolChipDetail = { text: string; tone?: "add" };

export interface ToolChipRow {
  /** Stable identity for repeated actions such as two consecutive reads. */
  id?: string;
  /** 图标键，见本文件的 `Icons`。认不出就不画图标。 */
  icon: string;
  /** 动作词，如「读取」。 */
  label: string;
  /** 芯片里的对象，如文件名 / 模块名。 */
  chip: string;
  mono?: boolean;
  detailMono?: boolean;
  /** 展开后的明细行；空数组表示这一行不可展开。 */
  detail?: ToolChipDetail[];
}

export type ToolChipDiff = { file: string; add: number; del: number };

export interface ToolChipsProps {
  rows: ToolChipRow[];
  /** 本轮改了哪些文件。空数组则整段不渲染。 */
  diffs?: ToolChipDiff[];
  /** 还在跑——最后一行走进行中的样式。 */
  working?: boolean;
  title?: string;
}

/**
 * 工具调用列表。
 *
 * 原版用一个 `STEP_MS` 定时器把 `ROWS` 一行行放出来（`step` 同时当"已显示到第几行"
 * 和"跑完没有"）。这里换成 props：行由真实的工具事件驱动，跑没跑完由 `working` 说了算。
 */
export default function ToolChips({ rows, diffs = [], working = false, title }: ToolChipsProps) {
  // 运行时主动把过程露出来，结束后收成一行。用户手动点过以后尊重他的选择。
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const open = manualOpen ?? working;
  const step = rows.length + (working ? 0 : 1);
  const total = rows.length + 1;

  const toggleRow = (id: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="w-full max-w-80 pb-1">
      {/* collapsed run header */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManualOpen((current) => !(current ?? working))}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-mr-control px-1.5 py-1 text-mr-ui text-mr-ink-secondary transition-colors duration-100 hover:bg-mr-surface-subtle"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">{title ?? `${rows.length}`}</span>
      </button>

      {/* tool call rows */}
      <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        {/* -mx-1 + px-1.5 keeps content at the same x while giving the
            row hover pills room inside this overflow-hidden clip box */}
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
        <div className="mt-1.5 flex flex-col gap-1">
          {rows.slice(0, step).map((row, index) => {
            const rowId = row.id ?? `${row.label}:${row.chip}:${index}`;
            const expandable = Boolean(row.detail?.length);
            const rowOpen = expandable && openRows.has(rowId);
            const content = (
              <>
                <span className="flex size-4 shrink-0 items-center justify-center text-mr-muted">
                  <Icon name={row.icon} />
                </span>
                <span className="shrink-0 text-mr-ui font-medium text-mr-ink-secondary">{row.label}</span>
                {row.chip ? <span
                  className={`inline-flex h-5.5 min-w-0 max-w-full items-center truncate rounded-chip bg-mr-surface-subtle px-1.5
                    text-mr-label-tight text-[#43464c] shadow-mr-control dark:bg-mr-surface-subtle dark:text-mr-ink-secondary dark:shadow-none
                    ${row.mono ? "font-mono" : ""}`}
                >
                  {row.chip}
                </span> : null}
                {expandable ? (
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    className="ml-0.5 shrink-0 text-mr-muted transition-transform duration-200"
                    style={{ transform: rowOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                ) : null}
              </>
            );
            return (
            <div key={rowId} style={{ animation: "fade-up 300ms var(--narrate-ease) both" }}>
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={rowOpen}
                  onClick={() => toggleRow(rowId)}
                  className="-mx-1 flex h-7 max-w-full items-center gap-2 rounded-mr-control px-1 text-left transition-colors duration-100 hover:bg-mr-surface-subtle"
                >
                  {content}
                </button>
              ) : (
                <div className="flex h-7 max-w-full items-center gap-2 text-left">
                  {content}
                </div>
              )}

              {/* expanded detail */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{ gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0, transitionTimingFunction: "var(--narrate-ease)" }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-mr-line py-0.5 pl-3.5">
                    {(row.detail ?? []).map((line) => (
                      <span
                        key={line.text}
                        className={`truncate text-mr-label-tight leading-[1.6] ${row.detailMono ? "font-mono" : ""} ${line.tone === "add" ? "text-mr-success-ink" : "text-mr-ink-secondary"}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>

      {/* 文件改动芯片。原版这里是写死的 DIFFS 列表加一个「+2 more」——
          现在由调用方给；不给就整段不渲染。 */}
      {diffs.length > 0 && step >= total && (
        <div className="mt-2.5 flex max-w-full flex-wrap gap-1.5 border-t border-mr-line pt-2.5">
          {diffs.map((d, i) => (
            <span
              key={d.file}
              className="inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-chip
                bg-mr-surface px-2 font-mono text-mr-label-tight text-mr-ink shadow-mr-control
                transition-colors duration-100 hover:bg-mr-surface-soft"
              style={{ animation: `pop-in 250ms var(--narrate-ease) ${i * 80}ms both` }}
            >
              <span className="min-w-0 truncate">{d.file}</span>
              <span className="shrink-0 text-mr-success-ink tabular-nums">+{d.add}</span>
              {d.del > 0 && <span className="shrink-0 text-mr-danger tabular-nums">−{d.del}</span>}
            </span>
          ))}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
