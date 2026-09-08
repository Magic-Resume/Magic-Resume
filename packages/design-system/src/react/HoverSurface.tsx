'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '../cx.js';

/**
 * 一块在同组选项之间移动的高亮面。
 *
 * GenUI 的共享高亮面原语。
 * 关键不在曲线，在**机制**：每一项各自 hover 变底色时，指针快速划过去得到的是
 * 一串闪烁；换成一块共享的面从 A 滑到 B，读的才是连续的位移。
 *
 * 所以选项本身不带任何 hover 背景——它们只负责换文字色，底交给这一块。
 *
 * 移动全程不触发 React 重渲染：位置直接写进 DOM 样式，hover 一个导航不该让整棵
 * 树跑一遍。位移用 `translate3d` 上合成器；宽高做不到，但同屏就这么几项，值。
 */

type Key = string | number;

/** 每一项都带上它，容器才能判断指针此刻是否落在某一项上（见 containerProps.onPointerMove）。 */
const ITEM_ATTR = 'data-hover-surface-item';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export type HoverSurfaceBinding = {
  ref: (el: HTMLElement | null) => void;
  onPointerEnter: () => void;
  onFocus: () => void;
  [ITEM_ATTR]: string;
};

/**
 * 某一项要让面换个样子时给的名字，会落到面的 `data-surface-variant` 上。
 * 调用方用 `data-[surface-variant=danger]:bg-red-500/10` 之类接住。
 *
 * 参考那边的下拉菜单也是这么做的：高亮滑到「删除」那一行时整块转成红调，
 * 而不是让那一行自己另画一个底。
 */
export type HoverSurfaceVariant = string;

/** 位移 420ms，透明度快得多——面要先出现，再谈移到哪。 */
const MOVE_MS = 420;
const FADE_IN_MS = 180;
/** 退场比进场长：进场要快到跟得上指针，退场太快就读不出「它走了」，只剩一下闪。 */
const FADE_OUT_MS = 260;

const MOVE = [
  `transform ${MOVE_MS}ms var(--ease-mr-enter)`,
  `width ${MOVE_MS}ms var(--ease-mr-enter)`,
  `height ${MOVE_MS}ms var(--ease-mr-enter)`,
].join(', ');

const TRANSITION_IN = `${MOVE}, opacity ${FADE_IN_MS}ms ease`;
const TRANSITION_OUT = `${MOVE}, opacity ${FADE_OUT_MS}ms var(--ease-mr-state)`;

export function useHoverSurface({
  /** 没有指针悬停时面停在哪一项。给 `null` 就淡出。 */
  activeKey = null,
  /** 关掉整套行为（比如折叠态下选项只剩图标、面没有意义时）。 */
  disabled = false,
}: { activeKey?: Key | null; disabled?: boolean } = {}) {
  const reduce = usePrefersReducedMotion();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(new Map<Key, HTMLElement>());

  /**
   * 面是否还「在场」——决定下一次是滑过去还是直接就位。
   *
   * 注意它**不等于**「可见」：指针刚移开、淡出还在跑的时候，面仍然在场，此时再
   * 进来应该从当前位置滑过去并淡回来。之前拿「可见」当依据，淡出未完就判定不在场，
   * 下一次进入于是走 `transition: none`，把正在跑的淡出一并掐断——看起来就是
   * 「移开没有消失过渡」。
   *
   * 真正的离场由 hideTimer 在淡出走完之后宣布：那之后再进来才直接就位。
   */
  const liveRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 「指针还在容器里，但已经不在任何一项上」的宽限计时。 */
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 当前落点，供 ResizeObserver 在布局变化后重新贴合。 */
  const targetRef = useRef<Key | null>(null);
  const activeRef = useRef<Key | null>(activeKey);
  activeRef.current = activeKey;

  /** key → 变体名。只在 bind 时登记，paint 时读。 */
  const variantsRef = useRef(new Map<Key, HoverSurfaceVariant>());

  const paint = useCallback(
    (key: Key | null) => {
      targetRef.current = key;
      const surface = surfaceRef.current;
      const container = containerRef.current;
      if (!surface || !container) return;

      const el = key === null ? null : itemsRef.current.get(key);
      // `key === null` 写进条件里不只是为了短路——它顺带把后面的 key 收窄成非空。
      if (key === null || !el || disabled) {
        // 只淡出，**不归位**——归位会让面在消失的同时还滑一段，读作「它跑了」。
        surface.style.transition = reduce ? 'none' : TRANSITION_OUT;
        surface.style.opacity = '0';
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(
          () => {
            liveRef.current = false;
          },
          reduce ? 0 : FADE_OUT_MS,
        );
        return;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      const c = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x = r.left - c.left + container.scrollLeft;
      const y = r.top - c.top + container.scrollTop;

      // 只有「已经彻底离场」时才直接就位，否则会从上一个位置（或 0,0）飞过来。
      // 淡出途中重新进来不算离场——那时应该从当前位置接着滑。
      const instant = !liveRef.current;
      if (instant) surface.style.transition = 'none';
      surface.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      surface.style.width = `${r.width}px`;
      surface.style.height = `${r.height}px`;
      if (instant) void surface.offsetWidth; // 提交这一帧,再把过渡装回去
      surface.style.transition = reduce ? 'none' : TRANSITION_IN;
      surface.style.opacity = '1';
      // 停在选中项上时给个标记：面可以借它换一种底色（选中偏品牌色、悬停偏中性），
      // 参考那边的破坏性行也是这么让面转红的。
      if (key === activeRef.current) surface.setAttribute('data-on-active', '');
      else surface.removeAttribute('data-on-active');
      const variant = variantsRef.current.get(key);
      if (variant) surface.setAttribute('data-surface-variant', variant);
      else surface.removeAttribute('data-surface-variant');
      liveRef.current = true;
    },
    [disabled, reduce],
  );

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  // activeKey 变了（换页 / 换选中项）：没在 hover 时把面挪过去。
  useEffect(() => {
    paint(activeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, disabled]);

  // 容器尺寸变了（侧栏收起、窗口缩放、列表增删）就重新贴合，别停在旧坐标上。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const key = targetRef.current;
      if (key === null) return;
      const surface = surfaceRef.current;
      if (surface) surface.style.transition = 'none';
      paint(key);
      requestAnimationFrame(() => {
        if (surface) surface.style.transition = reduce ? 'none' : TRANSITION_IN;
      });
    });
    ro.observe(container);
    itemsRef.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [paint, reduce]);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  /** 挂到每一个选项上。`key` 必须和 `activeKey` 用同一套值。 */
  const bind = useCallback(
    (key: Key, variant?: HoverSurfaceVariant): HoverSurfaceBinding => {
      if (variant) variantsRef.current.set(key, variant);
      else variantsRef.current.delete(key);
      return {
      ref: (el: HTMLElement | null) => {
        if (el) itemsRef.current.set(key, el);
        else itemsRef.current.delete(key);
      },
      onPointerEnter: () => {
        clearIdle();
        paint(key);
      },
      // 键盘走位也要带上面,否则 Tab 过去时高亮留在别处。
      onFocus: () => {
        clearIdle();
        paint(key);
      },
      [ITEM_ATTR]: '',
      };
    },
    [paint, clearIdle],
  );

  /**
   * 容器的 ref，做成可组合的回调形式。
   *
   * `containerProps` 里已经带了一个 ref，多数地方直接摊开就行；但有的容器自己
   * 已经挂了 ref（账户菜单的面板就要用它测位置），一个元素挂不了两个，那种地方
   * 摊开其余属性、单独调这个。
   */
  const setContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  /** 挂到容器上。 */
  const containerProps = {
    ref: containerRef,
    /*
      光靠容器的 pointerleave 不够：网格最后一行的空单元、`flex-1` 撑出来的留白、
      容器自己的内边距——这些都还在容器盒子里，指针停在那儿永远不会触发 leave，
      高亮就赖着不走。所以这里再判一次「是否落在某一项上」。

      留 120ms 宽限而不是立刻收：项与项之间有 gap，横穿过去的那一两帧本来就不在
      任何一项上，立刻收会让滑动途中闪一下。
    */
    onPointerMove: (e: React.PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(`[${ITEM_ATTR}]`)) {
        clearIdle();
        return;
      }
      if (idleTimerRef.current) return;
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        paint(activeRef.current);
      }, 120);
    },
    onPointerLeave: () => {
      clearIdle();
      paint(activeRef.current);
    },
    onBlur: (e: React.FocusEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      paint(activeRef.current);
    },
  };

  const surfaceProps = {
    ref: surfaceRef,
    'aria-hidden': true as const,
    style: {
      transition: reduce ? 'none' : TRANSITION_IN,
      opacity: 0,
    } as React.CSSProperties,
  };

  return { containerProps, setContainer, surfaceProps, bind };
}

/**
 * 高亮面本体。样式全由调用方给——导航用实底，卡片网格用一圈描边（卡片自己不透明，
 * 面垫在下面会看不见，只能压在上面并且 `pointer-events-none`）。
 */
export const HoverSurface = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function HoverSurface({ className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cx('pointer-events-none absolute left-0 top-0', className)}
      {...rest}
    />
  );
});
