'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PolarisAvatar } from '../PolarisMark';
import { FLIGHT_APEX_AT, FLIGHT_ARC_PX, takeFlightOrigin } from './polarisFlight';

/**
 * 这一跳的三个数。
 *
 * 弧幅要和实际 travel 成比例才读得出来：欢迎态的宠物在面板中央、工位在底部，
 * 垂直距离两三百 px——十几 px 的弧占比不到 5%，等于没有。
 * 弧幅与顶点位置和「递纸条」共用一份（见 polarisFlight）。
 */
const FLIGHT_MS = 620;
const ARC_PX = FLIGHT_ARC_PX;
const APEX_AT = FLIGHT_APEX_AT;

const PERCH_SIZE = 28;

/** polaris-pet-excited.svg 里 `exhop` 的周期。姿态要演满整周期，截在帧中间会闪一下。 */
const EXCITED_CYCLE_MS = 520;
/** 完整版「递纸条」里，纸条飞到约 300ms 时小宠抬头（docs/specs/ai-quote-handoff §5A）。 */
const CHEER_LEAD_MS = 300;

type Flight = { dx: number; dy: number; scale: number };

/** 一次「接住」。`full` = 会话内首次引用，演满一个周期；否则只闪半拍。 */
export type PerchCheer = { nonce: number; full: boolean };

/**
 * Polaris 的工位——落在输入框正上方的一只小宠。
 *
 * **只做身份，不念旁白**：「agent 此刻在干什么」由线程里那颗 orb 说（见
 * ActivityOrb / agentActivity）。两处同时念同一句话，就是同一条信息说了两遍。
 * 唯一的例外是画布片段递进输入框时抬头「接住」一下（`cheer`）——那是交接动作的一部分，
 * 不是状态播报。
 *
 * 它不是「又一个头像」：欢迎态那只 56px 的大宠**就是这一只**，用户发出第一句话时
 * 它从屏幕中央跳下来落到这儿。因为宠物成了一个连续在场的角色，对话里就不必再每条
 * 消息复制一份头像。
 *
 * 转场是手写 FLIP 而不是 framer-motion 的 `layoutId`：后者是布局动画，每帧都要在
 * JS 里重算投影再写回样式，**上不了合成器**；而这一跳恰好触发在最忙的一帧——同时
 * 还在挂载 ChatThread、发请求、解析 SSE 流，抢同一个帧预算，第一次必卡。纯 transform
 * 的 FLIP 交给合成器跑，主线程再忙也不掉帧，顺带还能给 x / y 各配一条曲线做出真正
 * 的抛物线（layoutId 只能两点直线插值，弧线根本出不来）。
 *
 * 落地那一下起伏是**角色动作**，不是 UI 缓动——`.impeccable.md` 里「不弹跳、不
 * elastic」约束的是面板与卡片，而小蓝宠的人格设定里明写着「会蹦跳」。
 */
function PolarisPerch({ cheer }: { cheer?: PerchCheer | null }) {
  const reduce = useReducedMotion() ?? false;
  const petRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flying, setFlying] = useState(false);
  const [cheering, setCheering] = useState(false);

  // useLayoutEffect：起点必须在浏览器绘制**之前**算好并写进 transform，否则会先闪
  // 一帧「已经落在工位上」，再跳回起点开始飞。
  useLayoutEffect(() => {
    if (reduce) return;
    const origin = takeFlightOrigin();
    const el = petRef.current;
    if (!origin || !el) return;
    const box = el.getBoundingClientRect();
    const dx = origin.x - (box.left + box.width / 2);
    const dy = origin.y - (box.top + box.height / 2);
    // 起点离得太近 = 不是从欢迎态过来的（例如直接落在对话态），不值得演一次转场。
    if (Math.abs(dx) + Math.abs(dy) < 24) return;
    setFlight({ dx, dy, scale: origin.size / PERCH_SIZE });
    setFlying(true);
  }, [reduce]);

  useEffect(() => {
    if (!flying) return;
    const timer = window.setTimeout(() => setFlying(false), FLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [flying]);

  useEffect(() => {
    if (!cheer || reduce) return;
    const lead = cheer.full ? CHEER_LEAD_MS : 0;
    const hold = cheer.full ? EXCITED_CYCLE_MS : EXCITED_CYCLE_MS / 2;
    const on = window.setTimeout(() => setCheering(true), lead);
    const off = window.setTimeout(() => setCheering(false), lead + hold);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [cheer, reduce]);

  const duration = FLIGHT_MS / 1000;

  return (
    // 让它**站在**输入框的上边缘，而不是浮在上方。
    //
    // 原来 perch 的 pb-1.5 加上 composer 的 pt-2 留了 14px 空隙，宠物就成了一只
    // 悬空的贴纸——没有落脚点，读起来像贴上去的。-mb-3.5 把这段空隙吃掉，让脚正好
    // 落在外壳的上沿；z-10 保证它压在外壳之上（composer 在 DOM 里靠后，不提层级
    // 就会把它盖住）。
    <div className="relative z-10 -mb-3.5 shrink-0 px-4 pt-1">
      {/* 再往右挪一点：贴着最左端就正好悬在圆角拐弯处，站不稳；挪进来落在平直的那段上 */}
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 pl-5">
        <motion.div
          ref={petRef}
          className="shrink-0"
          initial={flight ? { x: flight.dx, y: flight.dy, scale: flight.scale } : false}
          animate={
            flight
              ? {
                  x: [flight.dx, 0],
                  // 三个关键帧才有抛物线：起点 → 顶点 → 落点。顶点取「水平已经走了
                  // APEX_AT，但仍高出落点 ARC_PX」的那个位置。
                  y: [flight.dy, flight.dy * (1 - APEX_AT) - ARC_PX, 0],
                  scale: [flight.scale, 1],
                }
              : {}
          }
          transition={{
            // x 匀速：水平方向没有重力，恒速才像抛体。
            x: { duration, ease: 'linear' },
            // y 分两段配重力：上升 easeOut（离地快、到顶慢），下落 easeIn（越掉越快）。
            y: { duration, times: [0, APEX_AT, 1], ease: ['easeOut', 'easeIn'] },
            scale: { duration, ease: 'easeOut' },
          }}
        >
          {/* 落地即坐下：站姿贴在边上读作「踩着」，坐姿才是「栖」 */}
          <PolarisAvatar
            size={PERCH_SIZE}
            pose={flying ? 'jump' : cheering ? 'excited' : 'sit'}
          />
        </motion.div>
      </div>
    </div>
  );
}

export default React.memo(PolarisPerch);
