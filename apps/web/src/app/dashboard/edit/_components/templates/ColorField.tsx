"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X } from "@magic-resume/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { hexToRgb, rgbToHex } from "@/lib/utils/color";

type Hsv = { h: number; s: number; v: number };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const EASE = [0.22, 1, 0.36, 1] as const;

function normalizeHex(raw: string): string | null {
  const cleaned = raw.trim();
  if (!/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(cleaned)) return null;
  const rgb = hexToRgb(cleaned);
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase() : null;
}

function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255).toUpperCase();
}

/** A compact color row. Presets and the full HSV controls live in its floating picker. */
export function ColorField({
  label,
  description,
  value,
  onChange,
  presets = [],
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  presets?: readonly string[];
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const id = useId();
  const currentHex = normalizeHex(value) ?? "#000000";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentHex);
  const [invalid, setInvalid] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(currentHex));
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const saturationRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef(hsv);
  const appliedHexRef = useRef(currentHex);
  const dragRef = useRef<{ id: number; kind: "saturation" | "hue" } | null>(null);
  const changeFrameRef = useRef<number | null>(null);
  const pendingHexRef = useRef<string | null>(null);
  const skipBlurCommitRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => () => {
    if (changeFrameRef.current !== null) window.cancelAnimationFrame(changeFrameRef.current);
  }, []);

  const flushPendingChange = () => {
    if (changeFrameRef.current !== null) window.cancelAnimationFrame(changeFrameRef.current);
    changeFrameRef.current = null;
    const hex = pendingHexRef.current;
    pendingHexRef.current = null;
    if (hex !== null) onChangeRef.current(hex);
  };

  const discardPendingChange = () => {
    if (changeFrameRef.current !== null) window.cancelAnimationFrame(changeFrameRef.current);
    changeFrameRef.current = null;
    pendingHexRef.current = null;
  };

  useEffect(() => {
    setDraft(currentHex);
    setInvalid(false);
    // Keep the chosen hue when dragging through white or black; RGB cannot retain it.
    if (currentHex !== appliedHexRef.current) {
      if (changeFrameRef.current !== null) window.cancelAnimationFrame(changeFrameRef.current);
      changeFrameRef.current = null;
      pendingHexRef.current = null;
      const next = hexToHsv(currentHex);
      hsvRef.current = next;
      setHsv(next);
      appliedHexRef.current = currentHex;
    }
  }, [currentHex]);

  const applyHsv = (next: Hsv) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next);
    appliedHexRef.current = hex;
    setDraft(hex);
    setInvalid(false);
    // The marker follows every pointer event; the resume renders at most once per frame.
    pendingHexRef.current = hex;
    if (changeFrameRef.current === null) {
      changeFrameRef.current = window.requestAnimationFrame(() => {
        changeFrameRef.current = null;
        const pending = pendingHexRef.current;
        pendingHexRef.current = null;
        if (pending !== null) onChangeRef.current(pending);
      });
    }
  };

  const commitDraft = () => {
    if (skipBlurCommitRef.current) return;
    const hex = normalizeHex(draft);
    if (!hex) {
      setInvalid(true);
      return;
    }
    setDraft(hex);
    setInvalid(false);
    discardPendingChange();
    if (hex !== appliedHexRef.current) {
      const next = hexToHsv(hex);
      hsvRef.current = next;
      setHsv(next);
    }
    appliedHexRef.current = hex;
    if (hex !== currentHex) onChange(hex);
  };

  const pickPreset = (raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    discardPendingChange();
    const next = hexToHsv(hex);
    hsvRef.current = next;
    setHsv(next);
    appliedHexRef.current = hex;
    setDraft(hex);
    setInvalid(false);
    onChange(hex);
  };

  const closePicker = useCallback((restoreFocus = false, discardDraft = false) => {
    // Commit the final drag before an outside click can apply another theme.
    if (changeFrameRef.current !== null) window.cancelAnimationFrame(changeFrameRef.current);
    changeFrameRef.current = null;
    const pending = pendingHexRef.current;
    pendingHexRef.current = null;
    if (pending !== null) onChangeRef.current(pending);
    if (discardDraft) {
      // Focusing the trigger fires the HEX input's blur synchronously. Escape
      // discards only uncommitted text; HSV changes have already been applied.
      skipBlurCommitRef.current = true;
      setDraft(appliedHexRef.current);
      setInvalid(false);
    }
    setOpen(false);
    dragRef.current = null;
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    skipBlurCommitRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const margin = 12;
      const width = Math.min(268, window.innerWidth - margin * 2);
      const height = panelRef.current?.offsetHeight ?? 342;
      const left = Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin));
      const below = anchor.bottom + 8;
      const top = below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, anchor.top - height - 8);
      setPosition({ top, left, width });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, position?.width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (fieldRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePicker();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePicker(true, true);
    };
    const focusFrame = window.requestAnimationFrame(() => saturationRef.current?.focus({ preventScroll: true }));
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closePicker]);

  const handleBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && (fieldRef.current?.contains(next) || panelRef.current?.contains(next))) return;
    // Pointer capture can blur the input without moving focus outside the picker.
    if (dragRef.current) return;
    closePicker();
  };

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>, kind: "saturation" | "hue") => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (kind === "saturation") {
      applyHsv({
        h: hsvRef.current.h,
        s: clamp01((event.clientX - rect.left) / rect.width),
        v: 1 - clamp01((event.clientY - rect.top) / rect.height),
      });
    } else {
      applyHsv({ ...hsvRef.current, h: clamp01((event.clientX - rect.left) / rect.width) * 360 });
    }
  };

  const pointerProps = (kind: "saturation" | "hue") => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { id: event.pointerId, kind };
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(event, kind);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.id !== event.pointerId || dragRef.current.kind !== kind) return;
      updateFromPointer(event, kind);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      flushPendingChange();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    },
    onPointerCancel: () => { flushPendingChange(); dragRef.current = null; },
    onLostPointerCapture: () => { flushPendingChange(); dragRef.current = null; },
  });

  const hexInput = (inPicker = false) => (
    <input
      id={`${id}-${inPicker ? "picker-hex" : "hex"}`}
      type="text"
      value={draft}
      onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); commitDraft(); }
        if (event.key === "Escape" && !open) { setDraft(currentHex); setInvalid(false); }
      }}
      aria-label={t("templateCustomizer.colors.hexLabel", { label, defaultValue: "{{label}} HEX color" })}
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-${inPicker ? "picker-error" : "error"}` : undefined}
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={16}
      className={cn(
        "min-w-0 bg-transparent font-mono text-mr-overline uppercase tracking-[0.02em] text-mr-ink outline-none placeholder:text-mr-muted",
        inPicker ? "h-9 flex-1 px-2.5" : "h-9 w-[94px] pr-2.5",
      )}
      placeholder="#000000"
    />
  );

  const errorText = (inPicker = false) => invalid && (
    <p id={`${id}-${inPicker ? "picker-error" : "error"}`} role={inPicker || !open ? "status" : undefined} className="mt-1.5 text-mr-label text-mr-danger">
      {t("templateCustomizer.colors.invalidHex", { defaultValue: "Enter a valid HEX color, such as #2563EB." })}
    </p>
  );

  return (
    <div ref={fieldRef} onBlur={handleBlur}>
      <div className="flex min-h-12 items-center justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={`${id}-hex`} className="block text-mr-caption font-medium text-mr-ink-secondary">{label}</label>
          {description && <p className="mt-0.5 text-mr-label leading-snug text-mr-muted">{description}</p>}
        </div>
        <div className={cn(
          "flex shrink-0 items-center gap-2 rounded-lg border bg-mr-surface-subtle pl-1.5 transition-colors duration-200 motion-reduce:transition-none focus-within:border-mr-focus/60 focus-within:bg-mr-surface-soft",
          invalid ? "border-mr-danger/70" : open ? "border-mr-accent/45" : "border-mr-line hover:border-mr-line-strong",
        )}>
          <motion.button
            ref={triggerRef}
            type="button"
            onClick={() => open ? closePicker() : setOpen(true)}
            aria-label={t("templateCustomizer.colors.openPicker", { label, defaultValue: "Choose {{label}}" })}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? `${id}-picker` : undefined}
            whileHover={reducedMotion ? undefined : { scale: 1.06 }}
            whileTap={reducedMotion ? undefined : { scale: 0.95 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: EASE }}
            className="h-6 w-6 shrink-0 rounded-md border border-mr-line-strong outline-none focus-visible:ring-2 focus-visible:ring-mr-focus focus-visible:ring-offset-2 focus-visible:ring-offset-mr-surface"
            style={{ backgroundColor: currentHex }}
          />
          {hexInput()}
        </div>
      </div>
      {errorText()}

      {position && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              id={`${id}-picker`}
              role="dialog"
              aria-label={label}
              onBlur={handleBlur}
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.97, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 3 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE }}
              style={{ position: "fixed", ...position, zIndex: 80, maxHeight: "calc(100dvh - 24px)", boxShadow: "var(--mr-shadow-panel)", transformOrigin: "top right" }}
              className="overflow-y-auto rounded-2xl border border-mr-line-strong bg-mr-surface p-3.5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-mr-caption font-semibold text-mr-ink">{label}</span>
                <button
                  type="button"
                  onClick={() => closePicker(true)}
                  aria-label={t("templateCustomizer.colors.closePicker", { defaultValue: "Close color picker" })}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-mr-muted transition-colors duration-150 hover:bg-mr-surface-soft hover:text-mr-ink outline-none focus-visible:ring-2 focus-visible:ring-mr-focus motion-reduce:transition-none"
                ><X size={14} aria-hidden /></button>
              </div>

              <div
                ref={saturationRef}
                {...pointerProps("saturation")}
                role="group"
                tabIndex={0}
                aria-label={t("templateCustomizer.colors.saturationBrightness", { defaultValue: "Saturation and brightness" })}
                aria-describedby={`${id}-color-hint ${id}-color-value`}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.05 : 0.01;
                  const next = { ...hsvRef.current };
                  if (event.key === "ArrowLeft") next.s = clamp01(next.s - step);
                  else if (event.key === "ArrowRight") next.s = clamp01(next.s + step);
                  else if (event.key === "ArrowUp") next.v = clamp01(next.v + step);
                  else if (event.key === "ArrowDown") next.v = clamp01(next.v - step);
                  else return;
                  event.preventDefault();
                  applyHsv(next);
                }}
                className="relative h-32 w-full cursor-crosshair touch-none rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-mr-focus focus-visible:ring-offset-2 focus-visible:ring-offset-mr-surface"
                style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
              >
                <div aria-hidden className="absolute inset-0 rounded-[10px]" style={{ background: "linear-gradient(to right, #fff, transparent)" }} />
                <div aria-hidden className="absolute inset-0 rounded-[10px]" style={{ background: "linear-gradient(to top, #000, transparent)" }} />
                <span aria-hidden className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
              </div>
              <p id={`${id}-color-hint`} className="sr-only">{t("templateCustomizer.colors.saturationBrightnessHint", { defaultValue: "Use left and right arrows for saturation, up and down for brightness. Hold Shift for larger steps." })}</p>
              <p id={`${id}-color-value`} className="sr-only">{t("templateCustomizer.colors.saturationBrightnessValue", { saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100), defaultValue: "Saturation {{saturation}}%, brightness {{brightness}}%." })}</p>

              <div
                {...pointerProps("hue")}
                role="slider"
                tabIndex={0}
                aria-label={t("templateCustomizer.colors.hue", { defaultValue: "Hue" })}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(hsv.h)}
                aria-orientation="horizontal"
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 10 : 1;
                  let next = hsvRef.current.h;
                  if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(360, next + step);
                  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, next - step);
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = 360;
                  else return;
                  event.preventDefault();
                  applyHsv({ ...hsvRef.current, h: next });
                }}
                className="relative my-2 h-7 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-mr-focus focus-visible:ring-offset-2 focus-visible:ring-offset-mr-surface"
              >
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }} />
                <span aria-hidden className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]" style={{ left: `${hsv.h / 360 * 100}%`, backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }} />
              </div>

              <div className={cn("flex items-center rounded-[10px] border bg-mr-surface-subtle px-1 focus-within:border-mr-focus/60", invalid ? "border-mr-danger/70" : "border-mr-line")}>
                <span aria-hidden className="ml-1 h-6 w-6 shrink-0 rounded-md border border-mr-line-strong" style={{ backgroundColor: currentHex }} />
                {hexInput(true)}
              </div>
              {errorText(true)}

              {presets.length > 0 && (
                <div className="mt-3.5 border-t border-mr-line-soft pt-3">
                  <p className="mb-2 text-mr-label font-medium text-mr-muted">{t("templateCustomizer.colors.presets", { defaultValue: "Suggested colors" })}</p>
                  <div className="grid grid-cols-8 gap-2">
                    {presets.map((color) => {
                      const active = normalizeHex(color) === currentHex;
                      return (
                        <motion.button
                          key={color}
                          type="button"
                          onClick={() => pickPreset(color)}
                          aria-label={t("templateCustomizer.colors.colorPreset", { color, defaultValue: "Use {{color}}" })}
                          aria-pressed={active}
                          title={color.toUpperCase()}
                          whileHover={reducedMotion ? undefined : { scale: 1.12 }}
                          whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                          transition={{ duration: reducedMotion ? 0 : 0.18, ease: EASE }}
                          className={cn("relative h-5 w-full rounded-md border border-mr-line-strong outline-none focus-visible:ring-2 focus-visible:ring-mr-focus focus-visible:ring-offset-2 focus-visible:ring-offset-mr-surface", active && "ring-2 ring-mr-ink ring-offset-2 ring-offset-mr-surface")}
                          style={{ backgroundColor: color }}
                        >{active && <Check size={11} aria-hidden className="absolute inset-0 m-auto text-white mix-blend-difference" />}</motion.button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
