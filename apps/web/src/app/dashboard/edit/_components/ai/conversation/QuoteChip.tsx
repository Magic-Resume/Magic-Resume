'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CornerUpLeft, X } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { EASE_ENTER, EASE_EXIT } from '@magic-resume/utils';
import {
  findLatestQuoteBlock,
  flyTo,
  setQuoteHover,
  toQuoteRect,
  type QuoteRect,
} from './quoteHandoff';

/** 经「询问 Polaris」抬进输入框的画布片段。 */
export type QuotedContext = {
  id: string;
  label: string;
  text: string;
  /** 纸条的起飞点：画布选区在 viewport 里的包围盒。没有就不飞。 */
  origin?: QuoteRect | null;
  /** 会话内首次引用演完整版，之后一律精简（docs/specs/ai-quote-handoff §5B）。 */
  motion?: 'full' | 'lite';
};

export type QuoteChipHandle = {
  /**
   * 把这次退场标成「并入消息」。
   *
   * 必须在清掉引用的那次状态更新**之前**调：退场分支在引用变成 null 的那一刻读取它，
   * 晚了就已经按「取消」沉下去了。
   */
  markSend: () => void;
};

type QuoteChipProps = {
  quote: QuotedContext | null;
  onClear?: () => void;
};

// 时长出自 docs/specs/ai-quote-handoff/design.md §5，改这里要同步改文档。
// 空间的展开 / 收起过渡在 ai-motion.css 的 .quote-slot；下面两个数只用来算何时卸载，须与它成对。
const CLOSE_MS = 200;
/** 收起比淡出晚 60ms 起跑、两者重叠——先淡完再收，中间就会露出一个空洞。 */
const CLOSE_DELAY_MS = 60;
const LIFT_MS = 120;
const FLIGHT_MS = 300;
const LAND_MS = 120;
const SEND_MS = 280;
const ABORT_MS = 80;
/** 起终点比这更近，飞一趟只会像抖了一下。 */
const MIN_FLIGHT_PX = 48;
/** 纸条离开纸面时微微倾斜、飞行中回正：读作一张纸，而不是一个按钮。 */
const SLIP_TILT_DEG = -3;

const cssEase = (curve: readonly number[]) => `cubic-bezier(${curve.join(',')})`;

/** 纸条与交接替身飘在画布和线程上方，必须是不透明的底；浅色主题靠 hairline + 落地影立住。 */
const FLOATING_SURFACE =
  'rounded-2xl border border-mr-line bg-neutral-900 px-3.5 py-2.5 shadow-[var(--elev-3)] dark:border-white/[0.08] dark:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.7)]';

type SlipProps = {
  quote: QuotedContext;
  origin: QuoteRect;
  aborted: boolean;
  getTarget: () => QuoteRect | null;
  onLand: () => void;
  onDone: () => void;
};

/**
 * 画布 → 输入框的那张纸条。
 *
 * 外层只由 `flyTo` 写 transform，内层只由 WAAPI 动 opacity / scale / rotate——两边各管
 * 各的属性，谁也不覆盖谁。
 */
function Slip({ quote, origin, aborted, getTarget, onLand, onDone }: SlipProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ getTarget, onLand, onDone });
  latest.current = { getTarget, onLand, onDone };
  const stopRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const ease = cssEase(EASE_ENTER);
    let cancelFlight: (() => void) | undefined;

    outer.style.transform = `translate3d(${origin.left}px, ${origin.top}px, 0)`;
    inner.animate(
      [
        { opacity: 0, transform: `scale(0.94) rotate(${SLIP_TILT_DEG}deg)` },
        { opacity: 1, transform: `scale(1) rotate(${SLIP_TILT_DEG}deg)` },
      ],
      { duration: LIFT_MS, easing: ease, fill: 'forwards' },
    );

    const fadeOut = (duration: number) =>
      inner
        .animate([{ opacity: getComputedStyle(inner).opacity }, { opacity: 0 }], {
          duration,
          fill: 'forwards',
        })
        .finished.then(
          () => latest.current.onDone(),
          () => undefined,
        );

    const land = () => {
      latest.current.onLand();
      void fadeOut(LAND_MS);
    };

    const lift = window.setTimeout(() => {
      const target = latest.current.getTarget();
      if (
        !target ||
        Math.hypot(target.left - origin.left, target.top - origin.top) < MIN_FLIGHT_PX
      ) {
        land();
        return;
      }
      inner.animate(
        [
          { transform: `scale(1) rotate(${SLIP_TILT_DEG}deg)` },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: FLIGHT_MS, easing: ease, fill: 'forwards' },
      );
      cancelFlight = flyTo({
        el: outer,
        from: origin,
        to: () => latest.current.getTarget(),
        duration: FLIGHT_MS,
        arc: true,
        onDone: land,
      });
    }, LIFT_MS);

    // 被新引用顶替或引用被清掉：停在原地淡掉，不排队、不再落位。
    stopRef.current = () => {
      window.clearTimeout(lift);
      cancelFlight?.();
      void fadeOut(ABORT_MS);
    };

    return () => {
      window.clearTimeout(lift);
      cancelFlight?.();
    };
  }, [origin]);

  useEffect(() => {
    if (aborted) stopRef.current();
  }, [aborted]);

  return (
    <div
      ref={outerRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[130]"
      style={{ willChange: 'transform' }}
    >
      <div
        ref={innerRef}
        className={`flex max-w-[min(360px,70vw)] items-start gap-2 ${FLOATING_SURFACE}`}
        style={{ opacity: 0, transformOrigin: '0 0' }}
      >
        <CornerUpLeft size={13} className="mt-0.5 shrink-0 text-sky-400" />
        <span className="truncate text-mr-micro font-medium uppercase tracking-wide text-neutral-500">
          {quote.label}
        </span>
      </div>
    </div>
  );
}

type SendCloneProps = {
  quote: QuotedContext;
  from: QuoteRect;
  target: HTMLElement;
  onDone: () => void;
};

/**
 * 发送时从引用卡飞进新消息的替身。
 *
 * 线程是独立的滚动容器，引用块在里面做 FLIP 会被裁掉；新增消息还会触发平滑滚动，终点
 * 一直在动——所以替身飞在 body 上，每帧追着引用块的实时位置。
 */
function SendClone({ quote, from, target, onDone }: SendCloneProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const handover = SEND_MS * 0.45;
    outer.style.transform = `translate3d(${from.left}px, ${from.top}px, 0)`;
    inner.animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], {
      duration: SEND_MS,
      fill: 'forwards',
    });
    // 引用块在后半程接替显示；backwards 让它在等待期里就保持透明，首帧不会先闪一下。
    target.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: SEND_MS - handover,
      delay: handover,
      easing: cssEase(EASE_ENTER),
      fill: 'backwards',
    });
    return flyTo({
      el: outer,
      from,
      to: () => {
        if (!target.isConnected) return null;
        const r = target.getBoundingClientRect();
        // 右缘对齐：用户气泡靠右，替身比引用块宽，对齐左缘会落到气泡外面。
        return { left: r.right - from.width, top: r.top, width: from.width, height: from.height };
      },
      duration: SEND_MS,
      arc: false,
      onDone: () => onDoneRef.current(),
    });
  }, [from, target]);

  return (
    <div
      ref={outerRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[130]"
      style={{ width: from.width, willChange: 'transform' }}
    >
      <div ref={innerRef} className={`flex items-start gap-2 ${FLOATING_SURFACE}`}>
        <CornerUpLeft size={13} className="mt-0.5 shrink-0 text-sky-400" />
        <div className="min-w-0 flex-1">
          <div className="text-mr-micro font-medium uppercase tracking-wide text-neutral-500">
            {quote.label}
          </div>
          <div className="line-clamp-2 text-mr-overline text-neutral-300">{quote.text}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * 输入框上方的引用卡，以及它进出场的整段「递纸条」（docs/specs/ai-quote-handoff/design.md）。
 *
 * 卡片占的空间用 grid 行高 0fr ↔ 1fr 过渡，而不是让它在文档流里一帧撑开：输入区是底部
 * 锚定的，行高一动，上方的小宠工位就跟着同一条曲线被托起 / 放下——位移只有一个来源。
 */
const QuoteChip = forwardRef<QuoteChipHandle, QuoteChipProps>(function QuoteChip(
  { quote, onClear },
  ref,
) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  // 退场期间还要继续画上一条，所以显示的引用与 prop 分开存。
  const [shown, setShown] = useState<QuotedContext | null>(quote);
  const [open, setOpen] = useState(Boolean(quote));
  // 完整版里内容要等纸条落位才显出来（§5A）。
  const [revealed, setRevealed] = useState(true);
  const [leaving, setLeaving] = useState<'cancel' | 'send' | null>(null);
  const [slip, setSlip] = useState<{
    quote: QuotedContext;
    origin: QuoteRect;
    aborted: boolean;
  } | null>(null);
  const [handoff, setHandoff] = useState<{
    quote: QuotedContext;
    from: QuoteRect;
    target: HTMLElement;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const slotRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string | null>(quote?.id ?? null);
  const exitModeRef = useRef<'cancel' | 'send'>('cancel');
  const timerRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      markSend: () => {
        exitModeRef.current = 'send';
      },
    }),
    [],
  );

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      setQuoteHover(false);
    },
    [],
  );

  useLayoutEffect(() => {
    const prevId = prevIdRef.current;
    const nextId = quote?.id ?? null;
    if (prevId === nextId) return;
    prevIdRef.current = nextId;
    window.clearTimeout(timerRef.current);
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }

    if (quote) {
      const entering = prevId === null;
      const origin = quote.origin;
      const flies = entering && !reduce && quote.motion === 'full' && Boolean(origin);
      // 先让浏览器在 0fr 上算一次样式，再切 1fr——两次改动落进同一帧，过渡就没有起点。
      if (entering) void slotRef.current?.offsetHeight;
      setShown(quote);
      setLeaving(null);
      setRevealed(!flies);
      setSlip((current) =>
        flies && origin
          ? { quote, origin, aborted: false }
          : current && { ...current, aborted: true },
      );
      setOpen(true);
      setAnnouncement(t('aiLab.composer.quoteAdded', { label: quote.label }));
      return;
    }

    const mode = exitModeRef.current;
    exitModeRef.current = 'cancel';
    const last = shown;
    setOpen(false);
    setSlip((current) => current && { ...current, aborted: true });
    setQuoteHover(false);
    if (mode === 'send' && !reduce && last) {
      const handOff = () => {
        const surface = surfaceRef.current;
        const target = findLatestQuoteBlock(last.text);
        if (!surface || !target) return false;
        setHandoff({ quote: last, from: toQuoteRect(surface.getBoundingClientRect()), target });
        setLeaving('send');
        return true;
      };
      // 新消息通常和清掉引用落在同一次提交里：当场交接，替身在首帧绘制前就位，引用块不会先露一帧。
      // 消息晚一拍落地时再等一帧找它，仍找不到就按取消收起。
      if (!handOff()) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = undefined;
          if (!handOff()) setLeaving('cancel');
        });
      }
    } else {
      setLeaving('cancel');
      if (mode === 'cancel') setAnnouncement(t('aiLab.composer.quoteRemoved'));
    }
    timerRef.current = window.setTimeout(() => {
      setShown(null);
      setLeaving(null);
    }, CLOSE_DELAY_MS + CLOSE_MS);
  }, [quote, reduce, shown, t]);

  const getSurfaceRect = useCallback(() => {
    const surface = surfaceRef.current;
    return surface ? toQuoteRect(surface.getBoundingClientRect()) : null;
  }, []);

  const surfaceAnimate =
    leaving === 'send'
      ? // 替身已经叠在同一位置接手，本体直接撤，免得两张卡同框。
        { opacity: 0, y: 0, transition: { duration: 0 } }
      : leaving === 'cancel'
        ? {
            opacity: 0,
            y: reduce ? 0 : 6,
            transition: { duration: reduce ? 0.12 : 0.16, ease: EASE_EXIT },
          }
        : {
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0.12 : 0.24, ease: EASE_ENTER },
          };

  return (
    <>
      {/* 过渡写在 CSS（.quote-slot）而不是按 `reduce` 拼内联样式：SSR 读不到减弱动效偏好，
          水合时内联样式对不上也不会被修正，减弱动效的用户就会一直带着这段过渡。 */}
      <div
        ref={slotRef}
        className="quote-slot"
        data-open={open ? '' : undefined}
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        {/* 行高收到 0 时把内容裁掉。卡片从输入壳上沿「升起 / 沉回」的观感就来自这道裁切。 */}
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          {shown && (
            <div className="pb-2">
              <motion.div
                ref={surfaceRef}
                initial={{ opacity: 0, y: reduce || shown.motion === 'full' ? 0 : 4 }}
                animate={surfaceAnimate}
                onMouseEnter={() => setQuoteHover(true)}
                onMouseLeave={() => setQuoteHover(false)}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5"
              >
                <motion.div
                  className={`flex items-start gap-2 ${revealed ? '' : 'pointer-events-none'}`}
                  initial={false}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{ duration: LAND_MS / 1000, ease: 'linear' }}
                >
                  <CornerUpLeft size={13} className="mt-0.5 shrink-0 text-sky-400" />
                  <div className="relative min-w-0 flex-1">
                    {/* 替换时卡片不退场，只换里面的字（§5F）。 */}
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={shown.id}
                        initial={{ opacity: 0, y: reduce ? 0 : 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduce ? 0 : -3 }}
                        transition={{ duration: 0.15, ease: EASE_ENTER }}
                      >
                        <div className="text-mr-micro font-medium uppercase tracking-wide text-neutral-500">
                          {shown.label}
                        </div>
                        {/* 与消息里的引用块同为两行截断，发送时的交接才对得上。 */}
                        <div className="line-clamp-2 text-mr-overline text-neutral-300">
                          {shown.text}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={onClear}
                    aria-label={t('aiLab.composer.clearQuote')}
                    className="shrink-0 cursor-pointer text-neutral-500 transition-colors hover:text-neutral-200"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {slip &&
        createPortal(
          <Slip
            key={slip.quote.id}
            quote={slip.quote}
            origin={slip.origin}
            aborted={slip.aborted}
            getTarget={getSurfaceRect}
            onLand={() => setRevealed(true)}
            onDone={() => setSlip(null)}
          />,
          document.body,
        )}
      {handoff &&
        createPortal(
          <SendClone
            key={handoff.quote.id}
            quote={handoff.quote}
            from={handoff.from}
            target={handoff.target}
            onDone={() => setHandoff(null)}
          />,
          document.body,
        )}
    </>
  );
});

export default QuoteChip;
