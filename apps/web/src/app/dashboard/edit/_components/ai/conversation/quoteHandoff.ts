import { cubicBezier, easeIn, easeOut } from 'framer-motion';
import { EASE_ENTER } from '@magic-resume/utils';
import { FLIGHT_APEX_AT, FLIGHT_ARC_PX } from './polarisFlight';

/**
 * 「递纸条」的飞行与交接（docs/specs/ai-quote-handoff/design.md）。
 *
 * 两段飞行都演在 body 级 portal 里：画布舞台与对话列各自 overflow-hidden，在任一侧
 * 内部飞都会被裁掉。终点**每帧重读**——引用卡正在展开、线程正在平滑滚动，起飞时量到
 * 的位置，落地时已经不在那儿了。
 */

export type QuoteRect = { left: number; top: number; width: number; height: number };

/** DOMRect 不能展开拷贝，存进 state 前先转成普通对象。 */
export function toQuoteRect(rect: QuoteRect): QuoteRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

type FlyOptions = {
  /** `position: fixed` 于 (0, 0) 的元素；只写它的 transform。 */
  el: HTMLElement;
  from: QuoteRect;
  /** 每帧调用。返回 null = 终点已经不在了，就地结束。 */
  to: () => QuoteRect | null;
  duration: number;
  /** `true` 走与小宠同一套抛物线（纸条）；`false` 走快起长落的直线（并入消息）。 */
  arc: boolean;
  onDone: () => void;
};

const enterEase = cubicBezier(...EASE_ENTER);

/** 把 `el` 的左上角从 `from` 飞到 `to()`。返回取消函数。 */
export function flyTo({ el, from, to, duration, arc, onDone }: FlyOptions): () => void {
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const target = to();
    if (!target) {
      onDone();
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    let x: number;
    let y: number;
    if (arc) {
      // 水平没有重力，匀速；垂直分两段：上升 easeOut、下落 easeIn，顶点偏早（同 PolarisPerch）。
      x = from.left + (target.left - from.left) * t;
      const travel = Math.hypot(target.left - from.left, target.top - from.top);
      const apex =
        from.top + (target.top - from.top) * FLIGHT_APEX_AT - Math.min(FLIGHT_ARC_PX, travel * 0.25);
      y =
        t < FLIGHT_APEX_AT
          ? from.top + (apex - from.top) * easeOut(t / FLIGHT_APEX_AT)
          : apex + (target.top - apex) * easeIn((t - FLIGHT_APEX_AT) / (1 - FLIGHT_APEX_AT));
    } else {
      const e = enterEase(t);
      x = from.left + (target.left - from.left) * e;
      y = from.top + (target.top - from.top) * e;
    }
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (t < 1) frame = requestAnimationFrame(step);
    else onDone();
  });
  return () => cancelAnimationFrame(frame);
}

/**
 * 悬停引用卡时让画布上的淡标记加深。
 *
 * 走根节点属性而不是 React state：为一次 hover 让整个对话壳重渲染不值得。
 */
export function setQuoteHover(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-quote-hover', on);
}

/** 新发出的那条用户消息里的引用块。文本对不上就当没找到——宁可不飞，也不能飞错。 */
export function findLatestQuoteBlock(text: string): HTMLElement | null {
  const blocks = document.querySelectorAll<HTMLElement>('[data-quote-block]');
  const last = blocks[blocks.length - 1];
  return last?.textContent?.includes(text.slice(0, 24)) ? last : null;
}
