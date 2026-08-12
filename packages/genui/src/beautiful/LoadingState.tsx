"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * LOADING STATE — pixel-grid loader for long-running work
 *
 * Variants:
 *   Drive  — square cells, chevron wavefront driving right;
 *            the 650ms cycle is shorter than the sweep, so
 *            two fronts are always in flight
 *   Dots   — same wavefront, circular cells
 *   Orbit  — a comet lapping the grid perimeter
 *
 * Paired with a shimmering label and a live elapsed timer
 * in mono tabular figures. Reduced motion freezes the grid
 * to its dim state; the timer still ticks.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3), c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

const PATTERNS: Record<string, { delays: (number | null)[]; dur: number; round: boolean }> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

/**
 * 已走过的时间。
 *
 * 原版从挂载那一刻从 0 开始数——组件一重挂载计时就归零，而真实的一轮运行会跨越
 * 好几次重渲。改成从 `startedAt` 算：那才是这轮实际开始的时刻。
 */
function useElapsed(startedAt?: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = (Date.now() - (startedAt ?? Date.now())) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export interface LoadingStateProps {
  label?: string;
  /** 图元形态：`Drive`（方格波前）/ `Dots`（圆点波前）/ `Orbit`（绕圈彗星）。 */
  variant?: 'Drive' | 'Dots' | 'Orbit';
  /** 这轮开始的时刻（`Date.now()`）。缺省时从挂载算起。 */
  startedAt?: number;
}

export default function LoadingState({
  label = "Churning",
  variant = "Drive",
  startedAt,
}: LoadingStateProps) {
  const elapsed = useElapsed(startedAt);
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

  return (
    <div className="flex w-fit items-center gap-2.5">
      <span aria-hidden className="grid grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {delays.map((d, i) => (
          <span
            key={i}
            className={`size-[4px] bg-ink ${round ? "rounded-full" : "rounded-[1px]"}`}
            style={{
              opacity: d === null ? 0.07 : 0.15,
              animation:
                d === null ? "none" : `pixel-on ${dur}ms ease-in-out ${d}ms infinite`,
            }}
          />
        ))}
      </span>
      <span
        // shrink-0 + nowrap：它在 flex 行里没有这两条就会被压缩截断——ThinkingState
        // 那个同款标签本来就带 whitespace-nowrap，这里漏了。
        className="shrink-0 bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      >
        {label}
      </span>
      <span className="font-mono text-[12px] text-ink-3 tabular-nums">
        {elapsed}
      </span>
    </div>
  );
}
