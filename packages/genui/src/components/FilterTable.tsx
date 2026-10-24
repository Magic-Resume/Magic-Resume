"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * FILTER TABLE
 * Status chips directly filter the task table.
 * ───────────────────────────────────────────────────────── */

type DemoStatus = "todo" | "progress" | "done";

export interface FilterTableFilter {
  key: string;
  label: string;
  dot?: string;
  count: number;
}

export interface FilterTableColumn {
  key: string;
  label: string;
}

export interface FilterTableRow {
  id: string;
  status: string;
  cells: Record<string, ReactNode>;
}

export interface FilterTablePill {
  label: string;
  className: string;
}

export interface FilterTableProps {
  filters?: FilterTableFilter[];
  columns?: FilterTableColumn[];
  rows?: FilterTableRow[];
  pills?: Record<string, FilterTablePill>;
  /** CSS grid-template-columns used by the heading and every row. */
  gridTemplateColumns?: string;
  ariaLabel?: string;
  className?: string;
}

const FILTERS: FilterTableFilter[] = [
  { key: "all", label: "All", count: 5 },
  { key: "todo", label: "To do", dot: "#f09a2f", count: 2 },
  { key: "progress", label: "In Progress", dot: "#16a6c7", count: 2 },
  { key: "done", label: "Completed", dot: "#25a878", count: 1 },
];

const COLUMNS: FilterTableColumn[] = [
  { key: "task", label: "Task name" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "owner", label: "Advisor" },
];

const ROWS: FilterTableRow[] = [
  {
    id: "restock",
    status: "todo",
    cells: {
      task: "Restock mango sorbet",
      date: "Dec 03",
      owner: "Mango Moon Gelato",
    },
  },
  {
    id: "churn",
    status: "progress",
    cells: {
      task: "Churn black sesame",
      date: "Sep 22",
      owner: "Kumo Creamery",
    },
  },
  {
    id: "menu",
    status: "todo",
    cells: {
      task: "Print summer menu",
      date: "Jan 02",
      owner: "Coral Coast Sorbet",
    },
  },
  {
    id: "taste",
    status: "progress",
    cells: {
      task: "Taste-test batch 42",
      date: "Nov 08",
      owner: "Maple Orbit",
    },
  },
  {
    id: "cones",
    status: "done",
    cells: {
      task: "Order waffle cones",
      date: "Apr 14",
      owner: "Aurora Scoops",
    },
  },
];

const PILLS: Record<DemoStatus, FilterTablePill> = {
  todo: { label: "To do", className: "filter-status-todo" },
  progress: { label: "In Progress", className: "filter-status-progress" },
  done: { label: "Completed", className: "filter-status-done" },
};

export default function FilterTable({
  filters = FILTERS,
  columns = COLUMNS,
  rows = ROWS,
  pills = PILLS,
  gridTemplateColumns = "1.3fr 0.6fr 0.95fr 0.9fr",
  ariaLabel = "Scrollable filtered table",
  className = "",
}: FilterTableProps = {}) {
  const [filter, setFilter] = useState("all");

  // A persistent tracker can be updated in place. If its previously selected
  // status disappears, return to the first available filter instead of showing
  // an inexplicably empty table.
  useEffect(() => {
    if (!filters.some((candidate) => candidate.key === filter)) {
      setFilter(filters[0]?.key ?? "all");
    }
  }, [filter, filters]);

  return (
    <div className={`w-full max-w-105 ${className}`}>
      {/* filter chips */}
      <div
        className="-mx-1 mb-1 flex items-center gap-1 overflow-x-auto px-1 py-1"
        style={{ scrollbarWidth: "none" }}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-mr-overline
                font-medium transition-[background-color,box-shadow,color] duration-200
                ${active ? "bg-mr-surface text-mr-ink shadow-mr-control" : "text-mr-ink-secondary hover:bg-mr-surface-soft"}`}
            >
              {f.dot && (
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: f.dot }}
                />
              )}
              {f.label}
              <span
                className={`rounded px-1 text-mr-micro-plus tabular-nums
                  ${active ? "bg-mr-sunk text-mr-ink-secondary" : "text-mr-muted"}`}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* table */}
      <div
        aria-label={ariaLabel}
        className="overflow-x-auto rounded-mr-card bg-mr-surface shadow-mr-panel"
        role="region"
        tabIndex={0}
        style={{ scrollbarWidth: "none" }}
      >
        <div className="min-w-[420px]">
          <div
            className="grid border-b border-mr-line px-3 py-2 text-mr-label-tight font-medium text-mr-muted"
            style={{ gridTemplateColumns }}
          >
            {columns.map((column) => (
              <span key={column.key}>{column.label}</span>
            ))}
          </div>
          {rows.map((row) => {
            const shown = filter === "all" || row.status === filter;
            const pill = pills[row.status];
            return (
              <div
                key={row.id}
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: shown ? "1fr" : "0fr",
                  opacity: shown ? 1 : 0,
                  transitionTimingFunction: "var(--narrate-ease)",
                }}
              >
                <div className="overflow-hidden">
                  <div
                    className="grid items-center border-b
                      border-mr-line px-3 py-2 text-mr-overline transition-colors duration-100
                      last:border-0 hover:bg-mr-surface-soft"
                    style={{ gridTemplateColumns }}
                  >
                    {columns.map((column) => (
                      <span
                        key={column.key}
                        className={
                          column.key === "status"
                            ? ""
                            : "min-w-0 truncate text-mr-ink-secondary"
                        }
                      >
                        {column.key === "status" && pill ? (
                          <span
                            className={`inline-flex h-5 items-center rounded-mr-compact px-1.5
                              text-mr-label font-medium ${pill.className}`}
                          >
                            {pill.label}
                          </span>
                        ) : (
                          row.cells[column.key]
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
