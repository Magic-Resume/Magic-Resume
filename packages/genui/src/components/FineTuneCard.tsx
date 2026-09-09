"use client";

import { useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * FINE-TUNE CARD — compact interactive inspector.
 * Number fields scrub: hover the label for an ↔ cursor and
 * drag to adjust, use ↑/↓ (⇧ for ×10), or type directly.
 * ───────────────────────────────────────────────────────── */

function ScrubField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  active,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  active?: boolean;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  return (
    <label
      className="flex h-6.5 min-w-0 items-center gap-1 rounded-chip py-1 pr-1 pl-0.5
        transition-[background-color,box-shadow] duration-200"
      style={{
        background: active ? "var(--mr-accent-tint)" : "var(--mr-sunk)",
        boxShadow: active ? "0 0 0 1px var(--mr-accent)" : "none",
      }}
    >
      {/* scrub handle */}
      <span
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onChange(clamp(drag.current.v + ((e.clientX - drag.current.x) / 2) * step));
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const mult = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(clamp(value + step * mult));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onChange(clamp(value - step * mult));
          }
        }}
        className="flex h-full shrink-0 cursor-ew-resize touch-none items-center rounded
          px-0.5 text-mr-overline text-mr-muted select-none hover:text-mr-ink-secondary focus-visible:text-mr-accent-ink
          focus-visible:outline-none"
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d-]/g, ""));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        aria-label={`${label} value`}
        className="min-w-0 flex-1 bg-transparent text-mr-overline text-mr-ink tabular-nums outline-none"
      />
      {suffix && <span className="shrink-0 pr-0.5 text-mr-label-tight text-mr-muted">{suffix}</span>}
    </label>
  );
}

const SEGMENTS = ["row", "col", "grid"] as const;

function SegmentIcon({ kind }: { kind: string }) {
  const dot = "size-1.5 rounded-xs border-[1.2px] border-current";
  if (kind === "row")
    return <span className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className={dot} />)}</span>;
  if (kind === "col")
    return <span className="flex flex-col gap-0.5">{[0, 1].map((i) => <span key={i} className={dot} />)}</span>;
  return (
    <span className="grid grid-cols-2 gap-0.5">
      {[0, 1, 2, 3].map((i) => <span key={i} className={dot} />)}
    </span>
  );
}

export default function FineTuneCard() {
  const [seg, setSeg] = useState(0);
  const [width, setWidth] = useState(324);
  const [height, setHeight] = useState(96);
  const [radius, setRadius] = useState(28);
  const [opacity, setOpacity] = useState(100);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typeValue, setTypeValue] = useState("Select type");
  const done =
    seg !== 0 || width !== 324 || height !== 96 || radius !== 28 || opacity !== 100 || typeValue !== "Select type";

  return (
    <div className="relative w-full max-w-60 rounded-mr-card bg-mr-surface shadow-mr-panel">
      {/* header */}
      <div className="primitive-card-bar flex items-center justify-between border-b border-mr-line">
        <span className="text-mr-caption font-medium text-mr-ink">Flavor card</span>
        {done ? (
          <span
            className="flex items-center gap-1.5 text-mr-overline font-medium text-mr-success-ink"
            style={{ animation: "pop-in 250ms var(--narrate-ease) both" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Edited
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-mr-compact border border-mr-accent/30 bg-mr-accent-tint">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--mr-accent)">
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
              </svg>
            </span>
            <span
              className="bg-clip-text text-mr-overline font-medium text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--mr-accent) 35%, var(--mr-accent-ink) 50%, var(--mr-accent) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Adjust
            </span>
          </span>
        )}
      </div>

      {/* layout section */}
      <div className="primitive-card-pad flex flex-col gap-2 border-b border-mr-line">
        <p className="text-mr-ui font-medium text-mr-ink">Layout</p>
        {/* Layo segmented: gray track, raised white thumb */}
        <div className="relative grid grid-cols-3 rounded-mr-control bg-mr-sunk p-0.5">
          <span
            aria-hidden
            className="absolute inset-y-0.5 rounded-md bg-mr-surface shadow-mr-control transition-transform duration-300"
            style={{
              width: "calc((100% - 4px) / 3)",
              left: 2,
              transform: `translateX(${seg * 100}%)`,
              transitionTimingFunction: "var(--narrate-ease)",
            }}
          />
          {SEGMENTS.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-label={`${s} layout`}
              aria-pressed={i === seg}
              onClick={() => setSeg(i)}
              className={`relative z-10 flex h-6 items-center justify-center transition-colors duration-200
                ${i === seg ? "text-mr-accent" : "text-mr-muted"}`}
            >
              <SegmentIcon kind={s} />
            </button>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <ScrubField label="W" value={width} onChange={setWidth} min={40} max={999} active={width !== 324} />
          <ScrubField label="H" value={height} onChange={setHeight} min={24} max={999} active={height !== 96} />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <ScrubField label="Radius" value={radius} onChange={setRadius} min={0} max={64} active={radius !== 28} />
          <ScrubField label="Opacity" value={opacity} onChange={setOpacity} min={0} max={100} suffix="%" active={opacity !== 100} />
        </div>
      </div>

      {/* interaction section */}
      <div className="primitive-card-footer flex items-center justify-between">
        <span className="text-mr-overline text-mr-muted">Type</span>
        <div className="relative -mr-0.5 w-30">
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
            className="flex h-6.5 w-full items-center justify-between rounded-chip bg-mr-sunk py-1 pr-1 pl-2
              shadow-mr-control transition-shadow duration-200 focus-visible:outline-none"
            style={{ boxShadow: menuOpen ? "0 0 0 1px var(--mr-accent)" : undefined }}
          >
            <span className={`text-mr-overline ${typeValue !== "Select type" ? "text-mr-ink" : "text-mr-muted"}`}>
              {typeValue}
            </span>
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--mr-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="transition-transform duration-200"
              style={{ transform: menuOpen ? "rotate(180deg)" : "rotate(0)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 bottom-8 z-10 w-30 rounded-mr-card bg-mr-surface p-1 shadow-mr-panel"
              style={{
                animation: "pop-in 200ms var(--narrate-ease) both",
                transformOrigin: "bottom right",
              }}
            >
              {["Seasonal", "Classic", "Limited"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setTypeValue(item);
                    setMenuOpen(false);
                  }}
                  className="flex h-6.5 w-full items-center rounded-md px-2 text-left text-mr-ui text-mr-ink
                    transition-colors duration-150 hover:bg-mr-sunk"
                  style={{ background: item === typeValue ? "var(--mr-sunk)" : "transparent" }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
