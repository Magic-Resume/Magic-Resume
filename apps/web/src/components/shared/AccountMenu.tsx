"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Settings } from '@magic-resume-kit/icons';
import { useTranslation } from "react-i18next";
import { useSettingsUiStore } from "@/store/useSettingsUiStore";
import { setPreferredLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { HelpSubmenu } from "./HelpSubmenu";

import { EASE_ENTER } from '@magic-resume-kit/utils';
import {
  HoverSurface,
  useHoverSurface,
  type HoverSurfaceBinding,
} from '@/components/ui/hover-surface';
interface AccountMenuProps {
  /**
   * `down` → opens below, right-aligned (dashboard top bar); `up` → opens above;
   * `right` → opens to the right (editor rail).
   */
  placement?: "down" | "up" | "right";
  /** Optional content (e.g. name / email) rendered inside the trigger, right of the
   *  avatar — makes the whole block the hit target. Omit for an avatar-only trigger. */
  label?: React.ReactNode;
}

const PANEL_WIDTH = 280;
const GAP = 8;

/**
 * Settings dropdown: settings, help and the language switch. There are no
 * accounts in the local-only app, so the trigger is a gear rather than an
 * avatar. The panel is portaled to <body> with fixed positioning so
 * `overflow-hidden` ancestors (the 52px editor rail) can't clip it.
 */
export default function AccountMenu({ placement = "up", label }: AccountMenuProps) {
  /* 菜单行共用一块滑动的底。 */
  const rowSurface = useHoverSurface();
  const { t, i18n } = useTranslation();
  const openSettings = useSettingsUiStore((s) => s.openSettings);
  const reduce = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<React.CSSProperties>({ left: 0, bottom: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clampLeft = (left: number) =>
      Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8));
    if (placement === "down") {
      setCoords({ left: clampLeft(r.right - PANEL_WIDTH), top: r.bottom + GAP });
    } else if (placement === "right") {
      setCoords({ left: r.right + GAP, bottom: window.innerHeight - r.bottom });
    } else {
      setCoords({ left: clampLeft(r.left), bottom: window.innerHeight - r.top + GAP });
    }
  }, [placement]);

  useEffect(() => {
    setMounted(true);
    const onClick = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      // The help fly-out is a child of this menu but lives in a portal on
      // <body>, so `panelRef.contains` cannot see it. Without this, mousedown
      // on one of its links counted as "outside": the menu closed, the fly-out
      // unmounted with it, and the click never reached the link — the item
      // simply did nothing.
      const element = node instanceof Element ? node : node.parentElement;
      if (element?.closest("[data-account-menu-flyout]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  if (!mounted) return null;

  const currentLang = i18n.language.startsWith("en") ? "en" : "zh";
  // Drops down from the top bar, rises from anything below it.
  const offsetY = reduce ? 0 : placement === "down" ? -6 : 6;

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const panel = (
    <motion.div
      // 面板自己已经挂了 ref（要测位置），一个元素挂不了两个——所以这里手动把
      // 共享面的容器也指过去，其余三个接管点单独摊。
      ref={(el: HTMLDivElement | null) => {
        panelRef.current = el;
        rowSurface.setContainer(el);
      }}
      onPointerMove={rowSurface.containerProps.onPointerMove}
      onPointerLeave={rowSurface.containerProps.onPointerLeave}
      onBlur={rowSurface.containerProps.onBlur}
      role="menu"
      aria-hidden={!open}
      initial={{ opacity: 0, scale: reduce ? 1 : 0.96, y: offsetY, visibility: "hidden" }}
      animate={
        open
          ? { opacity: 1, scale: 1, y: 0, visibility: "visible" }
          : {
              opacity: 0,
              scale: reduce ? 1 : 0.96,
              y: offsetY,
              transitionEnd: { visibility: "hidden" },
            }
      }
      transition={reduce ? { duration: 0.01 } : { duration: 0.14, ease: EASE_ENTER }}
      style={{
        position: "fixed",
        ...coords,
        width: PANEL_WIDTH,
        zIndex: 9999,
        transformOrigin: placement === "down" ? "top right" : "bottom left",
        pointerEvents: open ? "auto" : "none",
      }}
      className="rounded-2xl border border-mr-line-soft bg-desk/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl will-change-transform"
    >
      {/* sky top-seam signature */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />

      <HoverSurface
        {...rowSurface.surfaceProps}
        className="rounded-lg bg-mr-surface-soft data-[surface-variant=accent]:rounded-xl data-[surface-variant=accent]:bg-sky-400/10 data-[surface-variant=danger]:bg-red-500/10"
      />
      <MenuRow
        surface={rowSurface.bind('settings')}
        icon={<Settings size={16} />}
        label={t("account.menu.settings")}
        onClick={() => run(openSettings)}
      />
      <HelpSubmenu menuOpen={open} onNavigate={() => setOpen(false)} />

      {/* in-place language switch */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="text-sm text-neutral-400">{t("account.menu.language")}</span>
        <div className="inline-flex rounded-lg bg-mr-surface-subtle p-0.5">
          {(["en", "zh"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setPreferredLanguage(code)}
              className={cn(
                "rounded-md px-2 py-0.5 text-mr-overline transition-colors",
                currentLang === code ? "bg-sky-400/15 text-sky-200" : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              {code === "en" ? "EN" : "中文"}
            </button>
          ))}
        </div>
      </div>

    </motion.div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          reposition();
          setOpen((v) => !v);
        }}
        onPointerEnter={reposition}
        onFocus={reposition}
        aria-label={t("account.menu.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "group/acct flex items-center outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
          label
            ? "w-full rounded-xl px-2 py-1.5 transition-colors hover:bg-mr-surface-muted"
            : "rounded-full",
        )}
      >
        <span className={cn("shrink-0", label && "grid w-9 place-items-center")}>
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-1 transition-all",
              open ? "ring-sky-400/40" : "ring-white/10 group-hover/acct:ring-white/20",
            )}
          >
            <span
              className={cn(
                "flex h-full w-full items-center justify-center bg-neutral-800 transition-colors",
                open ? "text-neutral-100" : "text-neutral-400 group-hover/acct:text-neutral-200",
              )}
            >
              <Settings size={16} />
            </span>
          </span>
        </span>
        {label}
      </button>
      {createPortal(panel, document.body)}
    </>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  surface,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  surface?: HoverSurfaceBinding;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      {...surface}
      onClick={onClick}
      className="group relative z-[1] flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
    >
      <span className="shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300">{icon}</span>
      {label}
    </button>
  );
}
