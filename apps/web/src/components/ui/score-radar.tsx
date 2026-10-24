"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ScoreRadarAxis = {
  key: string;
  /** 角上的短名。中文 3–4 字，完整表述留给 `title`。 */
  label: string;
  title?: string;
  value: number;
};

type ScoreRadarProps = {
  axes: ScoreRadarAxis[];
  centerValue: number;
  /** 中心圆盘上数字下方的一个词（Solid / Strong / …），不是整句。 */
  centerCaption: string;
  /** 只给顶档上色：档位词平时是静的，accent 罕见才有分量。 */
  centerCaptionAccent?: boolean;
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
  ariaLabel?: string;
  className?: string;
};

/**
 * viewBox 比高略宽：两侧的角标签需要横向余量，否则窄面板下会被裁掉。
 * 半径都在这套坐标里算，组件本身对轴数不敏感（五轴即正五边形）。
 */
const VIEW_W = 240;
const VIEW_H = 208;
const CX = VIEW_W / 2;
// 几何中心必须正好是 viewBox 中心：framer-motion 会把 SVG 的 transform-origin 规范成
// 50% 50%，两者重合了入场缩放才是从雷达正中长出来，而不是一边放大一边漂。
const CY = VIEW_H / 2;
const RADIUS = 58;
const LABEL_RADIUS = 82;
const DISC_RADIUS = 25;
const RING_LEVELS = [0.25, 0.5, 0.75, 1];

/** 第 i 条轴的角度：从正上方起顺时针均分。 */
function angleAt(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

function pointAt(index: number, count: number, radius: number) {
  const angle = angleAt(index, count);
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

function polygonPoints(radii: number[]): string {
  return radii
    .map((radius, index) => {
      const { x, y } = pointAt(index, radii.length, radius);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function ringPoints(count: number, level: number): string {
  return polygonPoints(Array.from({ length: count }, () => RADIUS * level));
}

/**
 * 多轴评分雷达：一张图同时给出总分和各维形状。
 *
 * 自己画 SVG 而不引图表库：轴数固定、几何就是几个 cos/sin，为一个多边形装 recharts
 * 不成比例，且项目此前零图表依赖（`RingGauge` 同样是手写 SVG）。
 *
 * 层序是刻意的——网格 → 中心盘 → 数值多边形 → 中心数字。中心盘画在多边形之下，
 * 低分时多边形塌进盘里也仍然盖在它上面看得见；数字画在最上面，两种极端都读得到。
 */
export function ScoreRadar({
  axes,
  centerValue,
  centerCaption,
  centerCaptionAccent = false,
  activeKey = null,
  onActiveChange,
  ariaLabel,
  className,
}: ScoreRadarProps) {
  const reduce = useReducedMotion();
  const count = axes.length;
  const valueRadii = axes.map(
    (axis) => (RADIUS * Math.min(100, Math.max(0, axis.value))) / 100,
  );

  if (count < 3) return null;

  return (
    <div
      // @container + cqw：SVG 随容器缩放，中心那两行是 HTML，字号写死就会在窄面板下
      // 撑破圆盘（"Outstanding" 比 "Solid" 长一倍）。让它跟着容器一起缩。
      className={cn(
        "@container relative mx-auto w-full max-w-[340px]",
        "aspect-[240/208]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {RING_LEVELS.map((level) => (
          <polygon
            key={level}
            points={ringPoints(count, level)}
            fill="none"
            stroke="var(--mr-line)"
            strokeWidth={level === 1 ? 1 : 0.6}
          />
        ))}
        {axes.map((axis, index) => {
          const spoke = pointAt(index, count, RADIUS);
          return (
            <line
              key={axis.key}
              x1={CX}
              y1={CY}
              x2={spoke.x}
              y2={spoke.y}
              stroke="var(--mr-line)"
              strokeWidth={0.6}
            />
          );
        })}

        <circle
          cx={CX}
          cy={CY}
          r={DISC_RADIUS}
          fill="var(--mr-surface-soft)"
        />

        <motion.g
          // view-box 不能省：framer-motion 对 SVG 默认套 fill-box，那是多边形自己包围盒
          // 的中心，五边形不对称时缩放的锚点就跑了。
          style={{ transformBox: "view-box" }}
          initial={reduce ? false : { scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <polygon
            points={polygonPoints(valueRadii)}
            fill="var(--mr-accent)"
            fillOpacity={0.2}
            stroke="var(--mr-accent)"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          {axes.map((axis, index) => {
            const vertex = pointAt(index, count, valueRadii[index]);
            const active = activeKey === axis.key;
            return (
              <circle
                key={axis.key}
                cx={vertex.x}
                cy={vertex.y}
                r={active ? 3.2 : 2}
                fill="var(--mr-accent)"
              />
            );
          })}
        </motion.g>
      </svg>

      {/* 中心数字走 HTML 而非 SVG text：tabular-nums 与中文字距在这里才排得准。 */}
      <div
        className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
        style={{ top: `${((CY - 16) / VIEW_H) * 100}%` }}
      >
        <span className="text-[7.6cqw] leading-none font-semibold text-mr-ink tabular-nums">
          {Math.round(centerValue)}
        </span>
        <span
          className={cn(
            "mt-[0.9cqw] text-[2.9cqw] leading-none whitespace-nowrap",
            centerCaptionAccent ? "text-mr-accent" : "text-mr-muted",
          )}
        >
          {centerCaption}
        </span>
      </div>

      {axes.map((axis, index) => {
        const anchor = pointAt(index, count, LABEL_RADIUS);
        const active = activeKey === axis.key;
        const dimmed = activeKey !== null && !active;
        return (
          <button
            key={axis.key}
            type="button"
            title={axis.title}
            aria-pressed={active}
            onMouseEnter={() => onActiveChange?.(axis.key)}
            onMouseLeave={() => onActiveChange?.(null)}
            onFocus={() => onActiveChange?.(axis.key)}
            onBlur={() => onActiveChange?.(null)}
            // 触屏没有 hover，点一下切换同一个态。
            onClick={() => onActiveChange?.(active ? null : axis.key)}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-0.5",
              "rounded-mr-compact px-1.5 py-0.5 transition-opacity duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mr-focus",
              dimmed && "opacity-40",
            )}
            style={{
              left: `${(anchor.x / VIEW_W) * 100}%`,
              top: `${(anchor.y / VIEW_H) * 100}%`,
            }}
          >
            <span
              className={cn(
                "text-mr-micro whitespace-nowrap transition-colors",
                active ? "text-mr-ink" : "text-mr-muted",
              )}
            >
              {axis.label}
            </span>
            <span
              className={cn(
                "text-mr-caption font-medium tabular-nums transition-colors",
                active ? "text-mr-accent" : "text-mr-ink-secondary",
              )}
            >
              {Math.round(axis.value)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
