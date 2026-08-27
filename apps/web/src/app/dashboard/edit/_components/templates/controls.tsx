"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp, Check, Download } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from "@/lib/utils";
import { hexToRgb, rgbToHex } from "@/lib/utils/color";
import { inspectResumeFontPack, downloadResumeFontPack } from '@/lib/utils/pdf-export';

/* ------------------------------------------------------------------ *
 * 右侧自定义面板的统一控件原语 —— 深色工作台 + sky 点缀、少 border。
 * 仅用 transform / opacity 动效,克制不抢戏(对齐 .impeccable.md)。
 * ------------------------------------------------------------------ */

/** 折叠分区:头部 [图标][标题][chevron],内容高度过渡展开 */
export function AccordionSection({
  sectionId,
  icon,
  title,
  open,
  onToggle,
  registerRef,
  children,
}: {
  sectionId: string;
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  registerRef?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={registerRef}
      data-section={sectionId}
      className="scroll-mt-4 border-b border-white/[0.06] last:border-b-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 px-1 py-3.5 text-left transition-colors duration-150"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            open
              ? "bg-sky-400/10 text-sky-300"
              : "bg-white/[0.04] text-neutral-400 group-hover:text-neutral-200",
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "flex-1 text-[15px] font-semibold tracking-tight transition-colors duration-150",
            open ? "text-white" : "text-neutral-300 group-hover:text-white",
          )}
        >
          {title}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-neutral-500 transition-transform duration-200 group-hover:text-neutral-300",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-1 pb-5 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 一行标签 + 右侧只读数值 pill */
function LabelRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-neutral-300">{label}</span>
      {value !== undefined && (
        <span className="rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] tabular-nums text-neutral-300">
          {value}
        </span>
      )}
    </div>
  );
}

/** 区块小标题(分组用) */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
      {children}
    </h4>
  );
}

/** 细滑块 + 标签 + 数值 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="space-y-2.5">
      <LabelRow label={label} value={display} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="range-sky"
        style={{
          background: `linear-gradient(to right, #38bdf8 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
        }}
      />
    </div>
  );
}

/** 开关行(标题 + 描述 + switch) */
export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-neutral-300">{label}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-sky-500" : "bg-white/10 hover:bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-[#fff] shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

/** 分段预设按钮组 */
export function SegmentedField<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2.5">
      {label && <LabelRow label={label} />}
      <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "relative flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors duration-150",
                active ? "text-white" : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${label ?? "x"}`}
                  className="absolute inset-0 rounded-lg bg-sky-500/90 shadow-sm shadow-sky-500/20"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 颜色换算(无依赖,自建取色器用) ---------------- */
type Hsv = { h: number; s: number; v: number };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToHex({ h, s, v }: Hsv) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const hexToHsv = (hex: string) => {
  const { r, g, b } = hexToRgb(HEX_RE.test(hex) ? hex : "#000000") ?? { r: 0, g: 0, b: 0 };
  return rgbToHsv(r, g, b);
};

function startDrag(e: React.PointerEvent, compute: (x: number, y: number) => void) {
  e.preventDefault();
  compute(e.clientX, e.clientY);
  const move = (ev: PointerEvent) => compute(ev.clientX, ev.clientY);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** 锚定到触发元素的 portal 浮层(随滚动重定位,点外/Esc 关闭,不被滚动容器裁剪) */
function AnchoredPopover({
  anchorRef,
  open,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const W = 236;
    const H = 252;
    const update = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const top = r.bottom + 8 + H > window.innerHeight ? Math.max(8, r.top - H - 8) : r.bottom + 8;
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 236, zIndex: 70 }}
      className="rounded-xl border border-white/10 bg-neutral-900/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md"
    >
      {children}
    </motion.div>,
    document.body,
  );
}

/** 取色器:点色块弹出自建 HSV 选择器(饱和度面板 + 色相条 + hex)+ 预设格 */
export function ColorField({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: string[];
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const satRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  const applyHsv = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex);
    onChange(hex);
  };

  const commitText = (raw: string) => {
    setText(raw);
    const hex = raw.trim();
    if (HEX_RE.test(hex)) {
      onChange(hex);
      setHsv(hexToHsv(hex));
    }
  };

  const openPicker = () => {
    if (open) return setOpen(false);
    setHsv(hexToHsv(value));
    setOpen(true);
  };

  const onSat = (x: number, y: number) => {
    const r = satRef.current?.getBoundingClientRect();
    if (!r) return;
    applyHsv({ h: hsv.h, s: clamp01((x - r.left) / r.width), v: 1 - clamp01((y - r.top) / r.height) });
  };
  const onHue = (x: number) => {
    const r = hueRef.current?.getBoundingClientRect();
    if (!r) return;
    applyHsv({ ...hsv, h: clamp01((x - r.left) / r.width) * 360 });
  };

  return (
    <div className="space-y-2.5">
      <LabelRow label={label} />
      <div className="flex items-center gap-2.5">
        <button
          ref={anchorRef}
          type="button"
          onClick={openPicker}
          aria-label={label}
          className={cn(
            "h-9 w-9 shrink-0 rounded-lg border shadow-inner transition-colors duration-150",
            open ? "border-sky-400/70" : "border-white/15 hover:border-white/30",
          )}
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={text.toUpperCase()}
          onChange={(e) => commitText(e.target.value)}
          spellCheck={false}
          className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-[12.5px] tracking-wide text-neutral-100 outline-none transition-colors duration-150 placeholder:text-neutral-600 hover:border-white/20 focus:border-sky-400/60 focus:bg-white/[0.06]"
          placeholder="#000000"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {presets.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              className={cn(
                "h-5 w-5 rounded-md transition-transform duration-150 hover:scale-110",
                active ? "ring-2 ring-white ring-offset-2 ring-offset-[#0A0A0A]" : "ring-1 ring-white/10",
              )}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      <AnchoredPopover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)}>
        {/* 饱和度 / 明度面板 */}
        <div
          ref={satRef}
          onPointerDown={(e) => startDrag(e, onSat)}
          className="relative h-32 w-full cursor-crosshair touch-none rounded-lg"
          style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        >
          <div className="absolute inset-0 rounded-lg" style={{ background: "linear-gradient(to right, #fff, rgba(255,255,255,0))" }} />
          <div className="absolute inset-0 rounded-lg" style={{ background: "linear-gradient(to top, #000, rgba(0,0,0,0))" }} />
          <span
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>

        {/* 色相条 */}
        <div
          ref={hueRef}
          onPointerDown={(e) => startDrag(e, (x) => onHue(x))}
          className="relative mt-3 h-3 w-full cursor-pointer touch-none rounded-full"
          style={{
            background:
              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>

        {/* 当前色 + hex */}
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 rounded-lg border border-white/15" style={{ backgroundColor: value }} />
          <input
            type="text"
            value={text.toUpperCase()}
            onChange={(e) => commitText(e.target.value)}
            spellCheck={false}
            className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-[12.5px] tracking-wide text-neutral-100 outline-none transition-colors duration-150 hover:border-white/20 focus:border-sky-400/60"
            placeholder="#000000"
          />
        </div>
      </AnchoredPopover>
    </div>
  );
}

/**
 * 一档字体包在 UI 里的状态。**按档位存，不按字体名存**——面板里十几个字体只对应三个
 * 包（黑体 / 宋体 / 楷体），下好宋体之后 Georgia 必须立刻显示为可切。
 */
interface FontPackState {
  ready: boolean;
  bytes: number;
  ratio: number;
  failed: boolean;
}

const EMPTY_FONT_PACK: FontPackState = { ready: false, bytes: 0, ratio: 0, failed: false };

/**
 * 未下载时用的预览字体栈。
 *
 * 把排头的 family 换成它的「Preview」微型子集(只含「字 Aa」,几 KB),后面的系统兜底
 * 原样保留——预览子集万一没加载出来,还能退到系统字体,不至于空着。
 */
const previewStack = (stack: string) => {
  const parts = stack.split(',');
  const head = parts[0].trim().replace(/^["']|["']$/g, '');
  return [`"${head} Preview"`, parts.slice(1).join(',').trim()].filter(Boolean).join(', ');
};

const formatPackSize = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * 字体选择：自定义下拉（Radix portal，带逐项字体预览，深色工作台风格）。
 *
 * **切换是被下载闸住的**：CJK 字体一档 5–8MB，没在本地时点下去只会得到一段无解释的
 * 等待。这里把它摊开——没下载的那档显示体积和下载图标，点击先下载、进度就地显示，
 * 下完才真正切过去。已在本地的字体行为不变，不多一次点击。
 */
export function FontField({
  label,
  value,
  onChange,
  fonts,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fonts: { name: string; value: string; preview: string; webfont?: boolean }[];
}) {
  const { t } = useTranslation();
  const selected = fonts.find((f) => f.value === value) ?? fonts[0];

  const [open, setOpen] = useState(false);
  const [packIdOf, setPackIdOf] = useState<Record<string, string>>({});
  const [packs, setPacks] = useState<Record<string, FontPackState>>({});
  const [pending, setPending] = useState<string | null>(null);
  // 完成回调里要读「用户现在还想切到哪」，走 ref 而不是 state：那一步是副作用，
  // 放进 setState 的 updater 里会在 StrictMode 下被跑两次。
  const pendingRef = useRef<string | null>(null);
  // Radix 选中后会自己关闭。挑了一个没下载的字体时这次关闭要作废，否则进度条刚出现
  // 就随面板消失了。
  const keepOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    void (async () => {
      const results = await Promise.all(
        fonts.map(async (f) => [f.value, await inspectResumeFontPack(f.value)] as const),
      );
      if (!alive) return;

      const ids: Record<string, string> = {};
      const found: Record<string, FontPackState> = {};
      for (const [stack, pack] of results) {
        ids[stack] = pack.id;
        found[pack.id] ??= { ready: pack.ready, bytes: pack.bytes, ratio: 0, failed: false };
      }
      setPackIdOf(ids);
      setPacks((prev) => {
        const next = { ...prev };
        for (const [id, state] of Object.entries(found)) next[id] ??= state;
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [open, fonts]);

  const patchPack = (id: string, patch: Partial<FontPackState>) =>
    setPacks((prev) => ({
      ...prev,
      [id]: { ...EMPTY_FONT_PACK, ...prev[id], ...patch },
    }));

  const startDownload = (fontStack: string) => {
    const id = packIdOf[fontStack];
    if (!id || packs[id]?.ready) return;

    pendingRef.current = fontStack;
    setPending(fontStack);
    patchPack(id, { failed: false });

    void downloadResumeFontPack(fontStack, (ratio) => patchPack(id, { ratio }))
      .then(() => {
        patchPack(id, { ready: true, ratio: 1 });
        // 点它就是想换，下完直接切过去，不该再点一次。
        // 若这期间用户又点了别的字体，pending 已经变了，这次就只是「下好了」。
        if (pendingRef.current !== fontStack) return;
        pendingRef.current = null;
        setPending(null);
        onChange(fontStack);
        setOpen(false);
      })
      .catch(() => {
        patchPack(id, { failed: true, ratio: 0 });
        if (pendingRef.current !== fontStack) return;
        pendingRef.current = null;
        setPending(null);
      });
  };

  const handleValueChange = (next: string) => {
    const id = packIdOf[next];
    const pack = id ? packs[id] : undefined;
    if (pack && !pack.ready) {
      keepOpen.current = true;
      startDownload(next);
      return; // 不调 onChange —— 下载好了才切换
    }
    onChange(next);
  };

  const pendingPackId = pending ? packIdOf[pending] : undefined;
  const pendingRatio = pendingPackId ? (packs[pendingPackId]?.ratio ?? 0) : 0;

  return (
    <div className="space-y-2.5">
      <LabelRow label={label} />
      <SelectPrimitive.Root
        value={value}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={(next) => {
          if (!next && keepOpen.current) {
            keepOpen.current = false;
            return;
          }
          setOpen(next);
        }}
      >
        <SelectPrimitive.Trigger className="group relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] px-3 text-left text-[13px] text-neutral-100 outline-none transition-colors duration-150 hover:border-white/20 focus:border-sky-400/60 data-[state=open]:border-sky-400/60">
          <span className="text-lg leading-none text-neutral-200" style={{ fontFamily: selected.value }}>
            {selected.preview}
          </span>
          <span className="flex-1 truncate">{selected.name}</span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              size={15}
              className="shrink-0 text-neutral-500 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
          {/* 面板被关掉时下载仍在继续，这条线是它唯一的痕迹。 */}
          {pending && (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px origin-left bg-sky-400/80 transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${pendingRatio})` }}
            />
          )}
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-[60] max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl shadow-black/50 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-neutral-500">
              <ChevronUp size={14} />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1.5">
              {fonts.map((f) => {
                const packId = packIdOf[f.value];
                const pack = packId ? packs[packId] : undefined;
                // 同一档的多个字体共享一次下载，所以进度按 packId 比对，不按字体名。
                const busy = !!pack && !pack.ready && packId === pendingPackId;

                return (
                  <SelectPrimitive.Item
                    key={f.value}
                    value={f.value}
                    className="relative flex cursor-pointer select-none items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2 text-[13px] text-neutral-300 outline-none transition-colors duration-100 data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white data-[state=checked]:text-sky-300"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-base text-neutral-200"
                      /*
                        没下载的字体**不能用它自己预览**——@font-face 会为了画这个字
                        把整包拉下来，而那正是下载按钮要拦的东西。未就绪时改用只含
                        「字 Aa」的微型子集（几 KB），看得见样子又不触发整包下载；
                        下完换回真身，顺带成了完成的反馈。
                        系统字体项（苹方/宋体…）没有 webfont，始终按原栈渲染。
                      */
                      style={{
                        fontFamily: f.webfont && !pack?.ready ? previewStack(f.value) : f.value,
                      }}
                    >
                      {f.preview}
                    </span>
                    <SelectPrimitive.ItemText>{f.name}</SelectPrimitive.ItemText>

                    {pack && !pack.ready && (
                      /*
                        真按钮，不是图标标签。
                        `tabIndex={-1}`:键盘不用走到它——在行上按回车同样会命中下载闸门,
                        多一个 tab stop 只会让键盘用户每个字体都多按一次。
                        三个 stopPropagation:Radix 的 Item 在 pointerup 上选中,不拦住的话
                        点按钮会连带触发一次选中。就算漏了也不出错——闸门会把它变成同一次下载。
                      */
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={busy ? t('templatePanel.font.downloading') : t('templatePanel.font.download')}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!busy) startDownload(f.value);
                        }}
                        className={cn(
                          'relative ml-auto flex h-6 shrink-0 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] transition-colors duration-150',
                          busy
                            ? 'cursor-default bg-sky-400/10 text-sky-300'
                            : pack.failed
                              ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                              : 'bg-white/[0.06] text-neutral-300 hover:bg-sky-400/15 hover:text-sky-200',
                        )}
                      >
                        {/* 进度直接填在按钮里,不另起一条进度条——它本身就是这次下载的载体 */}
                        {busy && (
                          <span
                            aria-hidden
                            className="absolute inset-0 origin-left bg-sky-400/25 transition-transform duration-200 ease-out"
                            style={{ transform: `scaleX(${pack.ratio})` }}
                          />
                        )}
                        <span className="relative flex items-center gap-1">
                          {busy ? (
                            <span className="tabular-nums">{Math.round(pack.ratio * 100)}%</span>
                          ) : (
                            <>
                              <Download size={11} aria-hidden />
                              <span className="tabular-nums">
                                {pack.failed
                                  ? t('templatePanel.retry')
                                  : pack.bytes > 0
                                    ? formatPackSize(pack.bytes)
                                    : t('templatePanel.font.download')}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    )}

                    <SelectPrimitive.ItemIndicator className="ml-auto shrink-0">
                      <Check size={14} className="text-sky-300" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-neutral-500">
              <ChevronDown size={14} />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

/** 快速主题色板 */
export function ThemeSwatches({
  themes,
  active,
  onPick,
}: {
  themes: { id: string; from: string; to: string }[];
  active?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={cn(
            "relative h-8 flex-1 rounded-lg transition-transform duration-150 hover:scale-[1.04]",
            active === t.id ? "ring-2 ring-white ring-offset-2 ring-offset-[#0A0A0A]" : "ring-1 ring-white/10",
          )}
          style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
          title={t.id}
        >
          {active === t.id && (
            <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow" />
          )}
        </button>
      ))}
    </div>
  );
}

export const PANEL_FONTS = [
  // 中文字体。**每一项都对应一个真实的 CJK 字体包**(见 resume-templates 的
  // font-family.ts),不是只换 CSS 栈——屏幕靠 globals.css 的 @font-face,
  // PDF 靠 pdf/browser.tsx 的 manifest,两侧指的是同一批 woff2。
  { name: "苹方 PingFang", value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', preview: "字" },
  { name: "微软雅黑", value: '"Microsoft YaHei", "PingFang SC", sans-serif', preview: "字" },
  { name: "思源黑体", value: '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", sans-serif', preview: "字" },
  { name: "未来荧黑", value: '"Glow Sans SC", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "昭源黑体", value: '"Chiron Hei HK", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "霞鹜漫黑", value: '"LXGW Bright GB", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "更纱黑体", value: '"Sarasa Gothic SC", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "宋体 Songti", value: '"Songti SC", "SimSun", serif', preview: "字" },
  { name: "昭源宋体", value: '"Chiron Sung HK", "Songti SC", serif', preview: "字" , webfont: true },
  { name: "朱雀仿宋", value: '"Zhuque Fangsong", "FangSong", serif', preview: "字" , webfont: true },
  { name: "楷体 Kaiti", value: '"Kaiti SC", "KaiTi", serif', preview: "字" },
  { name: "霞鹜臻楷", value: '"LXGW ZhenKai GB", "Kaiti SC", serif', preview: "字" , webfont: true },
  { name: "秋水书体", value: '"Qiushui Shotai", "Kaiti SC", serif', preview: "字" , webfont: true },
  { name: "霞鹜标记体", value: '"LXGW Marker Gothic", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "Maple Mono CN", value: '"Maple Mono CN", ui-monospace, monospace', preview: "Aa" , webfont: true },
  { name: "Inter", value: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", preview: "Aa" },
  { name: "Helvetica", value: '"Helvetica Neue", Helvetica, Arial, sans-serif', preview: "Aa" },
  { name: "Arial", value: 'Arial, "Helvetica Neue", sans-serif', preview: "Aa" },
  { name: "Georgia", value: 'Georgia, "Times New Roman", serif', preview: "Aa" },
  { name: "Times New Roman", value: '"Times New Roman", Georgia, serif', preview: "Aa" },
  { name: "System UI", value: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", preview: "Aa" },
  { name: "Roboto", value: 'Roboto, "Helvetica Neue", Arial, sans-serif', preview: "Aa" },
  { name: "IBM Plex Serif", value: '"IBM Plex Serif", Georgia, serif', preview: "Aa" },
];

export const PANEL_PRESET_COLORS = [
  "#3B82F6", "#0EA5E9", "#6366F1", "#8B5CF6", "#EC4899",
  "#EF4444", "#F97316", "#F59E0B", "#10B981", "#14B8A6",
  "#0F172A", "#334155", "#64748B", "#111827", "#000000",
];

export const COLOR_THEMES = [
  { id: "blue", from: "#3B82F6", to: "#1E40AF", colors: { primary: "#3B82F6", secondary: "#1E40AF", accent: "#60A5FA" } },
  { id: "sky", from: "#38BDF8", to: "#0369A1", colors: { primary: "#0EA5E9", secondary: "#0369A1", accent: "#38BDF8" } },
  { id: "green", from: "#10B981", to: "#047857", colors: { primary: "#10B981", secondary: "#047857", accent: "#34D399" } },
  { id: "purple", from: "#8B5CF6", to: "#7C3AED", colors: { primary: "#8B5CF6", secondary: "#7C3AED", accent: "#A78BFA" } },
  { id: "orange", from: "#F97316", to: "#EA580C", colors: { primary: "#F97316", secondary: "#EA580C", accent: "#FB923C" } },
  { id: "slate", from: "#475569", to: "#1E293B", colors: { primary: "#334155", secondary: "#1E293B", accent: "#64748B" } },
] as const;
