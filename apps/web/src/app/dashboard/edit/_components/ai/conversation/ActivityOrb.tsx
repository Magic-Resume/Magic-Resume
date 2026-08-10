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
