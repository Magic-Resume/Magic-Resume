"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

import { EASE_ENTER, EASE_EXIT } from '@magic-resume/utils';
export interface DropMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
  /** 灰掉但仍占位——「这里本来有个东西，只是现在用不了」比整项消失更好读。 */
  disabled?: boolean;
  /** 第二行小字。给的话行高从 40px 放到两行。 */
  description?: string;
}

export interface DropMenuProps {
  trigger: React.ReactNode;
  items: DropMenuItem[];
  width?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  gap?: number;
  onOpenChange?: (open: boolean) => void;
}

/** 视口边缘留白。翻边和夹取都按它算。 */
const VIEWPORT_MARGIN = 8;
/** 下方空间少于这个数就翻到上面去。 */
const FLIP_THRESHOLD = 148;
const PANEL_RADIUS = 12;

type Side = NonNullable<DropMenuProps['side']>;
type Align = NonNullable<DropMenuProps['align']>;
type Placement = { top: number; left: number; side: Side; maxHeight: number };

/**
 * 收起态的裁剪框：面板从**贴着触发器的那个角**揭开，而不是整体淡入。
 *
 * 92% 不是 100%：留下的那一线让面板在第一帧就有形状，读作「从这个角展开」；
 * 裁到全无则是凭空长出来的一块，方向感就没了。`round 12px` 必须跟面板圆角一致，
 * 否则动画途中角是方的、落定才变圆，会看到一下「咔」。
 */
function hiddenClip(side: Side, align: Align): string {
  const r = `round ${PANEL_RADIUS}px`;
  if (side === 'top') {
    if (align === 'end') return `inset(92% 0% 0% 92% ${r})`;
    if (align === 'center') return `inset(92% 46% 0% 46% ${r})`;
    return `inset(92% 92% 0% 0% ${r})`;
  }
  if (side === 'right') {
    return align === 'end' ? `inset(92% 92% 0% 0% ${r})` : `inset(0% 92% 92% 0% ${r})`;
  }
  if (side === 'left') {
    return align === 'end' ? `inset(92% 0% 0% 92% ${r})` : `inset(0% 0% 92% 92% ${r})`;
  }
  if (align === 'end') return `inset(0% 0% 92% 92% ${r})`;
  if (align === 'center') return `inset(0% 46% 92% 46% ${r})`;
  return `inset(0% 92% 92% 0% ${r})`;
}

/** 缩放锚点。和裁剪的起始角是同一个角，两者不一致就会看到面板一边长一边挪。 */
function panelOrigin(side: Side, align: Align): string {
  const x =
    align === 'end' ? '100%' : align === 'center' ? '50%' : side === 'left' ? '100%' : '0%';
  const y =
    side === 'top' ? '100%' : align === 'end' && (side === 'left' || side === 'right') ? '100%' : '0%';
  return `${x} ${y}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function place(
  anchor: DOMRect,
  size: { width: number; height: number },
  side: Side,
  align: Align,
  gap: number,
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let actual = side;
  let top = 0;
  let left = 0;
  let maxHeight = vh - VIEWPORT_MARGIN * 2;

  if (side === 'left' || side === 'right') {
    const roomRight = vw - anchor.right - gap - VIEWPORT_MARGIN;
    const roomLeft = anchor.left - gap - VIEWPORT_MARGIN;
    if (side === 'right' && roomRight < size.width && roomLeft > roomRight) actual = 'left';
    if (side === 'left' && roomLeft < size.width && roomRight > roomLeft) actual = 'right';
    left = actual === 'right' ? anchor.right + gap : anchor.left - size.width - gap;
    top = align === 'end' ? anchor.bottom - size.height : anchor.top - 6;
  } else {
    const roomBelow = vh - anchor.bottom - gap - VIEWPORT_MARGIN;
    const roomAbove = anchor.top - gap - VIEWPORT_MARGIN;
    // 只在**放不下且另一边更宽裕**时才翻，不然滚动一下菜单就来回跳边。
    if (side === 'bottom' && roomBelow < FLIP_THRESHOLD && roomAbove > roomBelow) actual = 'top';
    if (side === 'top' && roomAbove < FLIP_THRESHOLD && roomBelow > roomAbove) actual = 'bottom';
    left =
      align === 'end'
        ? anchor.right - size.width
        : align === 'center'
          ? anchor.left + (anchor.width - size.width) / 2
          : anchor.left;
    if (actual === 'bottom') {
      top = anchor.bottom + gap;
      maxHeight = Math.max(80, vh - top - VIEWPORT_MARGIN);
    } else {
      maxHeight = Math.max(80, anchor.top - gap - VIEWPORT_MARGIN);
      top = anchor.top - gap - Math.min(size.height, maxHeight);
    }
  }

  return {
    left: Math.round(clamp(left, VIEWPORT_MARGIN, vw - size.width - VIEWPORT_MARGIN)),
    top: Math.round(clamp(top, VIEWPORT_MARGIN, vh - Math.min(size.height, maxHeight) - VIEWPORT_MARGIN)),
    side: actual,
    maxHeight,
  };
}

export function DropMenu({
  trigger,
  items,
  width = 'w-40',
  side = 'bottom',
  align = 'end',
  gap = 8,
  onOpenChange,
}: DropMenuProps) {
  const reduce = useReducedMotion() ?? false;
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<Placement>({
    top: 0,
    left: 0,
    side,
    maxHeight: 0,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  /**
   * 移出后的宽限期。触发器和面板之间隔着 `gap` 的空档，指针从一个挪到另一个
   * 必然要穿过去——不留这一下，菜单在半路就关了。
   */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** 键盘 / 指针选中的那一项。-1 = 还没选，弹簧块不显示。 */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [highlight, setHighlight] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    danger: boolean;
  } | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );
  useEffect(() => onOpenChange?.(isOpen), [isOpen, onOpenChange]);

  const enabled = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setIsOpen(true);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 150);
  }, [cancelClose]);

  const close = useCallback((restoreFocus: boolean) => {
    cancelClose();
    setIsOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) {
      // 触发器可能是调用方传进来的任意元素，直接找它里面第一个可聚焦的东西。
      anchorRef.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus();
    }
  }, [cancelClose]);

  const reposition = useCallback(() => {
    const anchorEl = anchorRef.current;
    const panel = panelRef.current;
    if (!anchorEl || !panel) return;
    setPlacement(
      place(
        anchorEl.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.scrollHeight },
        side,
        align,
        gap,
      ),
    );
  }, [side, align, gap]);

  // 面板挂上之后立刻量一次，再跟着滚动 / 缩放走。position:fixed 不随页面滚动，
  // 所以触发器一动就必须重算，否则菜单会留在原地。
  useLayoutEffect(() => {
    if (!isOpen) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen, close]);

  // 弹簧块要落在哪儿。面板可能滚动，所以要把 scrollTop 加回去——
  // 绝对定位的子元素跟着内容滚，而 rect 是视口坐标。
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const el = itemRefs.current[activeIndex];
    if (!isOpen || activeIndex < 0 || !panel || !el) {
      setHighlight(null);
      return;
    }
    const p = panel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setHighlight({
      x: r.left - p.left + panel.scrollLeft,
      y: r.top - p.top + panel.scrollTop,
      w: r.width,
      h: r.height,
      danger: items[activeIndex]?.variant === 'danger',
    });
  }, [isOpen, activeIndex, placement, items]);

  const step = (direction: 1 | -1) => {
    if (!enabled.length) return;
    const at = enabled.findIndex((e) => e.index === activeIndex);
    const next =
      at < 0
        ? direction > 0
          ? enabled[0]
          : enabled[enabled.length - 1]
        : enabled[(at + direction + enabled.length) % enabled.length];
    setActiveIndex(next.index);
    itemRefs.current[next.index]?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        // 面板得先挂上才有得聚焦。
        requestAnimationFrame(() => step(e.key === 'ArrowDown' ? 1 : -1));
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
      if (!target) return;
      setActiveIndex(target.index);
      itemRefs.current[target.index]?.focus({ preventScroll: true });
    }
  };

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          role="menu"
          onMouseEnter={cancelClose}
          onMouseLeave={closeSoon}
          // 不在这里接 keydown：portal 里的按键会顺着 React 树冒到外层那个
          // onKeyDown，两处都接就会走两遍——方向键一次跳两格。
          tabIndex={-1}
          initial={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, scale: 0.96, clipPath: hiddenClip(placement.side, align) }
          }
          animate={
            reduce
              ? { opacity: 1, transition: { duration: 0.001 } }
              : {
                  opacity: 1,
                  scale: 1,
                  clipPath: `inset(0% 0% 0% 0% round ${PANEL_RADIUS}px)`,
                  // 参考实测：开 360ms、收 260ms，开比收慢——展开要看清结构，
                  // 收起时用户已经做完决定了，拖着只会挡路。
                  transition: { duration: 0.36, ease: EASE_ENTER },
                }
          }
          exit={
            reduce
              ? { opacity: 0, transition: { duration: 0.001 } }
              : {
                  opacity: 0,
                  scale: 0.96,
                  clipPath: hiddenClip(placement.side, align),
                  transition: { duration: 0.26, ease: EASE_EXIT },
                }
          }
          style={{
            position: 'fixed',
            top: placement.top,
            left: placement.left,
            maxHeight: placement.maxHeight || undefined,
            transformOrigin: panelOrigin(placement.side, align),
            zIndex: 9999,
          }}
          className={cn(
            width,
            'isolate overflow-auto overscroll-contain rounded-xl border border-hairline',
            'bg-[var(--surface-overlay)] p-1.5 shadow-[var(--elev-3)] backdrop-blur-xl outline-none',
            'scrollbar-hide',
          )}
        >
          {/* 弹簧高亮块。整张菜单只有这一块底色，它在选项之间移动——
              比每行各自亮起更能读出「我正停在哪一项」，指针快速划过时也不会
              留下一串闪烁。压在 z-0，选项内容在它上面。 */}
          {highlight && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0 rounded-lg"
              initial={false}
              animate={{
                x: highlight.x,
                y: highlight.y,
                width: highlight.w,
                height: highlight.h,
                opacity: 1,
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 720, damping: 48, mass: 1 }
              }
              style={{
                background: highlight.danger
                  ? 'color-mix(in oklab, var(--danger) 14%, transparent)'
                  : 'var(--surface-hover)',
              }}
            />
          )}

          {items.map((item, index) => {
            const danger = item.variant === 'danger';
            const active = index === activeIndex;
            return (
              <React.Fragment key={index}>
                {item.separator && index > 0 && (
                  // 负 margin 让分隔线铺满面板内边距——缩在里面会读成「一行很矮的空项」。
                  <div className="relative z-[1] -mx-1.5 my-1 h-px bg-[var(--border-hairline)]" />
                )}
                <button
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  aria-disabled={item.disabled || undefined}
                  tabIndex={-1}
                  onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                  onFocus={() => !item.disabled && setActiveIndex(index)}
                  onClick={(e) => {
                    if (item.disabled) return;
                    // 面板挂在 body 上，DOM 里到不了触发器背后的东西，但 React 的
                    // 合成事件仍会顺着组件树往上冒——点菜单项不该顺带点到卡片。
                    e.stopPropagation();
                    item.onClick();
                    close(false);
                  }}
                  className={cn(
                    // cursor 是 default 不是 pointer：菜单项不是链接，系统菜单里
                    // 也从不换手型。
                    'relative z-[2] flex w-full select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none',
                    'min-h-10 cursor-default',
                    danger ? 'text-[var(--danger)]' : 'text-primary',
                    item.disabled && 'pointer-events-none opacity-40',
                  )}
                >
                  {item.icon && (
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center transition-transform duration-200 ease-out',
                        danger ? 'text-current' : 'text-muted',
                        active && 'translate-x-0.5',
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 transition-transform duration-200 ease-out',
                      active && 'translate-x-0.5',
                    )}
                  >
                    <span className="block truncate text-sm font-medium leading-5">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="block truncate text-xs leading-4 text-muted">
                        {item.description}
                      </span>
                    )}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={rootRef}
      className="inline-flex"
      onKeyDown={onKeyDown}
      onMouseLeave={closeSoon}
    >
      {/*
        点击只**开**不切换。悬停已经把菜单打开时，再让点击切成关闭就会卡死：
        指针还停在触发器上，不会再有一次 mouseenter，菜单就再也开不回来。
        只开则对触屏也成立——那里没有悬停，一下点击就是唯一的入口。

        用捕获阶段接：调用方传进来的触发器可能自己 `stopPropagation()`（简历卡片
        就是这么拦住卡片本身的点击的），冒泡到这里就没了；捕获阶段在目标之前跑，
        两边各做各的。
      */}
      <div
        ref={anchorRef}
        className="inline-flex items-center justify-center"
        onMouseEnter={openNow}
        onClickCapture={openNow}
      >
        {trigger}
      </div>

      {mounted && createPortal(panel, document.body)}
    </div>
  );
}
