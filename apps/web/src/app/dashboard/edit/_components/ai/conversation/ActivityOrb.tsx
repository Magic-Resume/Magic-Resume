'use client';

import React from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';
import { ORB_STATE, type AgentActivity } from './agentActivity';

/**
 * Agent 状态的内联指示器。
 *
 * 取代此前那颗 `BreathGlyph`——它对读取简历、跑分析、等你审批、写字全用同一颗呼吸
 * 的星，携带的信息量是零。现在每种活动有各自的形态（`agentActivity.ts` 里的映射）。
 *
 * **只做内联，不进头像位**：64px 那个位置是像素小蓝宠的，它是项目的身份锚点
 * （`.impeccable.md`）。一颗通用 AI 球去顶它，等于把品牌换成"又一个助手"。
 *
 * 库自带共用时钟、离屏与隐藏标签页暂停、`prefers-reduced-motion` 静帧、DPR 封顶 2
 * ——和我们 `ModeDotField` 里手写的那套是同一批考量，不必再包一层。
 */
/* ------------------------------------------------------------------ 星点 */

/**
 * 「正在思考」用的星点指示器（Agent activity 的 `stars` 变体，布局 / 路径 /
 * 节奏照抄，颜色走本产品 token）。
 *
 * **只给 `thinking` 用，不铺到别的活动上**：其余状态的球是有信息量的——读简历、跑
 * 分析、等你审批各长一个样（`ORB_STATE`）；星点只表示「在忙」，铺开就把那层区分丢了。
 * 而 `thinking` 本来就是「已开始生成、首个 token 还没到」，球在那里也只是通用呼吸。
 */
const STAR_PERIOD_S = 1.4;
const STAR_LAYOUT = [
  { x: 50, y: 46, scale: 1 },
  { x: 18, y: 22, scale: 0.55 },
  { x: 82, y: 26, scale: 0.45 },
  { x: 78, y: 76, scale: 0.55 },
  { x: 22, y: 78, scale: 0.4 },
];
const STAR_PATH =
  'M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z';

const STAR_KEYFRAMES =
  // 放大淡入 → 稳住 → 消失。每颗的时长与错峰由内联 style 传入。
  '@keyframes thinking-star{0%,100%{transform:scale(0);opacity:0}' +
  '40%{transform:scale(1);opacity:1}60%{transform:scale(.8);opacity:.9}}' +
  '.thinking-star{transform:scale(0);animation-name:thinking-star;' +
  'animation-timing-function:ease-in-out;animation-iteration-count:infinite}' +
  // 减弱动效时停在可见态，而不是冻结在 scale(0)——那等于指示器整个消失。
  '@media (prefers-reduced-motion: reduce){.thinking-star' +
  '{animation:none;transform:none;opacity:.7}}';

export function ThinkingStars({ size = 20 }: { size?: number }) {
  // 星点比标签暗一档，避免五颗星抢过文字。
  const unit = size / 1.5;
  return (
    <span
      aria-hidden
      className="relative block shrink-0 text-neutral-500"
      style={{ width: size, height: size }}
    >
      <style>{STAR_KEYFRAMES}</style>
      {STAR_LAYOUT.map((star, i) => {
        const glyph = unit * star.scale;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="thinking-star absolute"
            style={{
              width: glyph,
              height: glyph,
              left: `${star.x}%`,
              top: `${star.y}%`,
              marginLeft: -glyph / 2,
              marginTop: -glyph / 2,
              animationDuration: `${STAR_PERIOD_S}s`,
              animationDelay: `${(i * STAR_PERIOD_S * 0.7) / STAR_LAYOUT.length}s`,
            }}
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        );
      })}
    </span>
  );
}

export default function ActivityOrb({
  activity,
  size = 20,
  className,
}: {
  activity: AgentActivity;
  size?: 20 | 64;
  className?: string;
}) {
  return (
    <ThinkingOrb
      state={ORB_STATE[activity] as OrbState}
      size={size}
      // 主题固定 dark：AI 面板是深色工作台，浅色主题下面板本身也不翻面，
      // 让 orb 跟着系统 auto 会在浅色系统里画出一颗浅色球贴在深色面板上。
      theme="dark"
      className={className}
      aria-hidden
    />
  );
}
