"use client";

import type { ReactNode } from "react";
import { useState } from "react";

/* ─────────────────────────────────────────────────────────
 * TASK ROWS
 *
 *     0ms   rows enter staggered (80ms apart)
 *   600ms   row 1 ring sweeps 0 → 66%
 *  1500ms   row 1 expands — detail steps drop down
 *  3900ms   row 1 collapses; row 2 flips to Failed + retry
 *  5300ms   row 2 resolves to Completed
 * The status run completes once; task details stay clickable.
 * ───────────────────────────────────────────────────────── */

function SpinnerRing({ active, children }: { active?: boolean; children?: React.ReactNode }) {
  const size = 24, stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size} height={size} className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--ink-3)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">{children}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: React.ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-[#fff]
        ${tone === "red" ? "bg-red" : "bg-green"}`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
);
const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);
const RetryIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
);

export interface TaskRowDetail {
  label: string;
  meta?: string;
}

export interface TaskRowItem {
  /** 稳定标识，用作 React key 与展开态的键。 */
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  /** 行首圈里的序号（仅未完成时显示）。 */
  step?: string | number;
  /** 右侧的量词，如「7 项」。 */
  amount?: string;
  /** 右侧状态胶囊里的文字；不给就不渲染胶囊。 */
  pill?: string;
  /** 展开后的明细行。 */
  details?: TaskRowDetail[];
  /**
   * 替掉行首那个由 `status` 派生的徽章。
   *
   * 给的理由：`status` 只有四态，而调用方可能有更细的「这一行此刻在干什么」——
   * AI Lab 的任务行按 agent 自己声明的 activity（读/写/分析/搜索…）换形态，那是
   * 四态表达不了的。不给就仍用派生徽章，行为不变。
   */
  leading?: ReactNode;
  /**
   * 替掉纯文本 `label` 的渲染（例如把动词做成芯片）。
   *
   * `label` 仍然必填且不会被省略——它继续承担 `title` 与无障碍读屏，
   * 富节点只负责好看的那一层。
   */
  labelNode?: ReactNode;
}

/**
 * 任务行列表。
 *
 * 原版用一个 `TICKS` 定时器推 6 个阶段，每行的徽章/胶囊/状态都由 `tick` 算出来 ——
 * 那是演示脚本，不是数据。这里换成 `tasks` props：状态由真实事件流决定，徽章与胶囊
 * 由 `status` 派生。
 */
export default function TaskRows({
  tasks,
  list = false,
  className = '',
}: {
  tasks: TaskRowItem[];
  /** `true` 合成一张表（行之间只有分隔线）；`false` 每行一张独立卡片。 */
  list?: boolean;
  /** 追加到容器上，供宿主覆盖宽度与外观（同 `FilterTable` 的约定）。 */
  className?: string;
}) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const rows = tasks.map((t) => ({
    key: t.key,
    badge: t.leading ?? (
      t.status === 'done' ? (
        <Badge tone="green">{CheckIcon}</Badge>
      ) : t.status === 'failed' ? (
        <Badge tone="red">{XIcon}</Badge>
      ) : (
        <SpinnerRing active={t.status === 'running'}>{t.step ?? ''}</SpinnerRing>
      )
    ),
    label: t.label,
    labelNode: t.labelNode,
    leading: t.leading,
    amount: t.amount,
    pill: t.pill ? (
      <span
        className={`inline-flex h-5.5 items-center rounded-full px-2 text-[11.5px] font-medium ${
          t.status === 'failed'
            ? 'bg-red-tint text-red'
            : t.status === 'done'
              ? 'bg-green-tint text-green'
              : 'bg-hover text-ink-3'
        }`}
      >
        {t.pill}
      </span>
    ) : null,
    details: t.details ?? [],
  }));

  return (
    <div
      className={`flex w-full max-w-110 flex-col ${
        list ? "gap-0 self-start overflow-hidden rounded-card bg-surface shadow-card" : "min-h-[196px] gap-2"
      } ${className}`}
    >
      {rows.map((row, i) => {
        // 原版会在脚本走到某一步时自动展开某一行；真实数据里没有"某一步"，只听用户。
        const open = manualOpen[row.key] ?? false;
        // 没有明细就不该有展开控件——点开一片空白比没有箭头更糟。
        const expandable = row.details.length > 0;
        return (
          <div
            key={row.key}
            className={`self-stretch overflow-hidden transition-[border-radius] duration-300 ${
              list ? "border-b border-line last:border-0" : "bg-surface shadow-card"
            }`}
            style={{
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
            }}
          >
            <button
              type="button"
              disabled={!expandable}
              aria-expanded={expandable ? open : undefined}
              onClick={
                expandable
                  ? () => setManualOpen((current) => ({ ...current, [row.key]: !open }))
                  : undefined
              }
              className={`flex h-11 w-full items-center gap-2.5 px-2.5 text-left transition-colors duration-100 ${
                expandable ? 'hover:bg-inset' : 'cursor-default'
              }`}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {row.badge}
              </span>
              <span
                title={row.label}
                className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink"
              >
                {row.labelNode ?? row.label}
              </span>
              <span className="text-[12.5px] text-ink-2 tabular-nums">{row.amount}</span>
              {row.pill}
              {expandable && (
              <span
                aria-hidden="true"
                className="-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3"
              >
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
              )}
            </button>

            {/* dropdown detail — same expandable grammar as Chain of Thought */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: open ? "1fr" : "0fr",
                  opacity: open ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="overflow-hidden">
                  <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                    <span aria-hidden className="mx-auto h-full w-px bg-line" />
                    <div className="flex flex-col gap-1.5">
                      {row.details.map((d, j) => (
                        <div
                          key={d.label}
                          className="flex items-center justify-between"
                          style={
                            open
                              ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 100}ms both` }
                              : undefined
                          }
                        >
                          <span className="text-[12px] text-ink-2">{d.label}</span>
                          <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
                            {d.meta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
          </div>
        );
      })}
    </div>
  );
}
