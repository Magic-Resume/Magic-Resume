"use client";

import { RiCloseLine, type RemixiconComponentType } from "@remixicon/react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { HoverSurface, useHoverSurface } from '@/components/ui/hover-surface';

/**
 * Product settings modal shell.
 *
 * The installed example shipped complete demo pages and its own global theme.
 * Magic Resume only consumes the shell: the two-phase mount, backdrop fade and
 * scale/blur panel transitions stay consistent with the product motion rules, while
 * navigation and page content remain owned by the product.
 */

export interface SettingsModalNavItem<Page extends string> {
  page: Page;
  label: string;
  icon: RemixiconComponentType;
}

export interface SettingsModalShellProps<Page extends string> {
  isOpen: boolean;
  onClose: () => void;
  activePage: Page;
  onPageChange: (page: Page) => void;
  title: string;
  closeLabel: string;
  navigationLabel: string;
  items: readonly SettingsModalNavItem<Page>[];
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function SettingsModalShell<Page extends string>({
  isOpen,
  onClose,
  activePage,
  onPageChange,
  title,
  closeLabel,
  navigationLabel,
  items,
  headerAccessory,
  footer,
  children,
}: SettingsModalShellProps<Page>) {
  // Separate mounted/visible phases keep the DOM present during its
  // hidden state for one committed frame before the transition starts.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [contentScrolled, setContentScrolled] = useState(false);
  /* 左侧分区导航共用一块滑动的底：选中项常驻，指针过谁就滑到谁那儿。 */
  const navSurface = useHoverSurface({ activeKey: activePage });

  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 320);
    }

    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [isOpen]);

  useEffect(() => {
    setContentScrolled(false);
    contentRef.current?.scrollTo({ top: 0 });
  }, [activePage]);

  // Match the product shell: Escape closes and focus enters the
  // panel, without introducing a second modal focus scope around React Aria's
  // portalled selects. A Radix parent dialog made their visible popover
  // inert because it lived outside that parent's focus boundary.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        onClick={onClose}
        className={cx(
          "absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm",
          "transition-opacity duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cx(
          "relative",
          // Product panel animation. Keep transform and filter on
          // one GPU-promoted layer to avoid close stutter.
          "transform-gpu transition-[opacity,transform,filter] duration-300 ease-enter will-change-[opacity,transform,filter]",
          visible
            ? "scale-100 opacity-100 blur-0"
            : "scale-[0.85] opacity-0 blur-[4px]",
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-magic-settings-panel=""
          className={cx(
            "relative flex h-[614px] max-h-[calc(100dvh-32px)] w-[871px] max-w-[calc(100vw-32px)] flex-col",
            "overflow-clip rounded-3xl bg-background-full shadow-xs outline-none sm:flex-row",
          )}
        >
            <nav
              aria-label={navigationLabel}
              className={cx(
                "relative flex shrink-0 gap-1 overflow-x-auto border-b border-separator-border bg-background-secondary-default p-2.5 scrollbar-hide",
                "sm:w-[274px] sm:flex-col sm:gap-1.5 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r",
              )}
              {...navSurface.containerProps}
            >
              <HoverSurface
                {...navSurface.surfaceProps}
                className="rounded-xl bg-background-secondary-hover/60 data-[on-active]:bg-background-secondary-hover"
              />
              <span className="hidden px-2 pb-0.5 pt-1 text-body-medium text-text-secondary sm:block">
                {navigationLabel}
              </span>
              {items.map((item) => {
                const selected = item.page === activePage;
                const Icon = item.icon;

                return (
                  <button
                    key={item.page}
                    type="button"
                    {...navSurface.bind(item.page)}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => onPageChange(item.page)}
                    className={cx(
                      // 选中底与 hover 底都交给上面那块共享面，这里只剩文字色。
                      "group relative flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left outline-none",
                      "transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                      selected ? "text-text-primary" : "text-text-secondary",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cx(
                        "size-[18px] shrink-0 transition-colors",
                        selected
                          ? "text-foreground-icon-primary"
                          : "text-foreground-icon-secondary",
                      )}
                    />
                    <span
                      className={cx(
                        "whitespace-nowrap text-mr-body-tight",
                        selected ? "font-medium text-text-primary" : "text-text-secondary",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-8 sm:pb-3 sm:pt-8">
                <h2 id={titleId} className="truncate text-title-3-medium text-text-primary">
                  {title}
                </h2>
                <div className="flex shrink-0 items-center gap-2.5">
                  {headerAccessory}
                  <button
                    type="button"
                    aria-label={closeLabel}
                    onClick={onClose}
                    className={cx(
                      "flex size-6 cursor-pointer items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-secondary",
                      "transition-colors duration-150 ease-out hover:bg-background-tertiary-hover",
                      "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    )}
                  >
                    <RiCloseLine className="size-4" aria-hidden />
                  </button>
                </div>
              </header>

              <div className="relative min-h-0 flex-1">
                <div
                  ref={contentRef}
                  className="h-full overflow-y-auto px-5 pb-8 scrollbar-hide sm:px-8"
                  onScroll={(event) =>
                    setContentScrolled(event.currentTarget.scrollTop > 0)
                  }
                >
                  {children}
                </div>
                <div
                  aria-hidden
                  className={cx(
                    "pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background-full to-transparent",
                    "transition-opacity duration-200 ease-out",
                    contentScrolled ? "opacity-100" : "opacity-0",
                  )}
                />
              </div>

              {footer}
            </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
