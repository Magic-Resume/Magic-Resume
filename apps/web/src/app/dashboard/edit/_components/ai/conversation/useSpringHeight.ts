'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * 让一个可折叠区域的高度按**物理**变化，而不是按一条贝塞尔曲线走完。
 *
 * 参照的是真实产品的逐帧数据：一次长高 165→182px，增量 6,3,2,2,2,2 —— 起步快、单调
 * 衰减、**从不冲过头**。那是临界阻尼弹簧，不是会回弹的弹簧振子。
 *
 * 换掉 CSS transition 的真正理由不是曲线，是**速度可以被继承**：任务行是成串到达的
 * （一次运行里四五次追加很常见），CSS transition 每次都从零速度重启，看起来一顿一顿；
 * 弹簧带着上一次的余速接着走。
 */

/** 临界阻尼：damping ≈ 2√(k·m)。取略微过阻尼，宁可稳一点也不要回弹。 */
const STIFFNESS = 210;
const DAMPING = 30;
/** 固定子步长积分——大步长会让高刚度弹簧发散。 */
const SUB_STEP = 1 / 240;
/** 停机阈值：位移与速度都进了这个范围就吸附到目标，免得永远在跑 rAF。 */
const EPSILON = 0.15;

export interface SpringHeight<C extends HTMLElement = HTMLElement> {
  /** 挂到被裁剪的外层（`overflow: hidden`）。 */
  clipRef: React.RefObject<HTMLDivElement | null>;
  /** 挂到内容本身。**测量口径只此一处**——见下面的注释。 */
  contentRef: React.RefObject<C | null>;
  /** 内容变了或折叠态变了，调它。 */
  settle: () => void;
}

export function useSpringHeight<C extends HTMLElement = HTMLElement>(
  collapsed: boolean,
): SpringHeight<C> {
  const clipRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<C | null>(null);
  const reduce = useReducedMotion() ?? false;

  const state = useRef({ x: 0, v: 0, target: 0, raf: 0, last: 0, primed: false });

  /**
   * 内容该占多高。
   *
   * 两条都是踩出来的，不是风格选择：
   * 1. 用 `getBoundingClientRect().height` 而不是 `offsetHeight`——后者**四舍五入成
   *    整数**，13.5px 字号配 9px 间距必然算出小数，抹掉的那不到 1px 正好是最后一行
   *    的字母下伸部。再 `ceil` 一次，彻底不留裁掉的余地。
   * 2. 内容容器**只能用 padding 不能用 margin**：两种测量都不含 margin，留 margin 就
   *    等于让裁剪框比内容矮那么多，底下一截被 `overflow: hidden` 切掉。
   */
  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return 0;
    return Math.ceil(el.getBoundingClientRect().height);
  }, []);

  const write = useCallback((h: number) => {
    const clip = clipRef.current;
    if (clip) clip.style.height = `${Math.max(0, h)}px`;
  }, []);

  const settle = useCallback(() => {
    const s = state.current;
    s.target = collapsed ? 0 : measure();

    // 首帧直接吸附：卡片刚出现时不该从 0 弹开一次——那是它「本来就有的高度」，
    // 不是一次变化。
    if (!s.primed) {
      s.primed = true;
      s.x = s.target;
      s.v = 0;
      write(s.x);
      return;
    }

    if (reduce) {
      s.x = s.target;
      s.v = 0;
      write(s.x);
      return;
    }

    if (s.raf) return;
    s.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - s.last) / 1000, 1 / 30); // 丢帧时不让它炸
      s.last = now;
      let remaining = dt;
      while (remaining > 0) {
        const h = Math.min(SUB_STEP, remaining);
        remaining -= h;
        const a = -STIFFNESS * (s.x - s.target) - DAMPING * s.v;
        s.v += a * h;
        s.x += s.v * h;
      }
      write(s.x);
      if (Math.abs(s.x - s.target) < EPSILON && Math.abs(s.v) < EPSILON) {
        s.x = s.target;
        s.v = 0;
        write(s.x);
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [collapsed, measure, reduce, write]);

  // 折叠态一变就重新定目标。内容变化由调用方在改完之后调 settle()。
  useEffect(() => {
    settle();
  }, [settle]);

  // 字体加载完、窗口变宽变窄，都会让内容重新排版——**不重新量就会裁掉**。
  // ResizeObserver 直接盯内容盒，比监听 resize 更准（侧栏开合不触发 window resize）。
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => settle());
    ro.observe(el);
    return () => ro.disconnect();
  }, [settle]);

  useEffect(() => {
    const s = state.current;
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  return { clipRef, contentRef, settle };
}
