'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { AgentMode } from './modes';

type Dot = {
  x: number;
  y: number;
  opacity?: number;
  scale?: number;
};

/**
 * 模式条的状态图形。三档共用同一批九个点，只变坐标：
 * - 共创：AI 的星芒 / 核心
 * - 规划：分支决策网络
 * - 问答：带尾巴的对话气泡
 *
 * 因为点不卸载，切换时每个点都会到自己的下一位置，而不是两个方形图标交叉淡入淡出。
 */
const MODE_SHAPES: Record<AgentMode, readonly Dot[]> = {
  cocreate: [
    { x: 8, y: 0 },
    { x: 13, y: 3 },
    { x: 16, y: 8 },
    { x: 13, y: 13 },
    { x: 8, y: 16 },
    { x: 3, y: 13 },
    { x: 0, y: 8 },
    { x: 3, y: 3 },
    { x: 8, y: 8, scale: 1.25 },
  ],
  plan: [
    { x: 4, y: 0 },
    { x: 12, y: 0 },
    { x: 0, y: 5 },
    { x: 8, y: 5 },
    { x: 16, y: 5 },
    { x: 8, y: 9, scale: 1.25 },
    { x: 2, y: 14 },
    { x: 8, y: 14 },
    { x: 14, y: 14 },
  ],
  ask: [
    { x: 4, y: 0 },
    { x: 10, y: 0 },
    { x: 15, y: 3 },
    { x: 16, y: 8 },
    { x: 12, y: 13 },
    { x: 7, y: 14 },
    { x: 2, y: 12 },
    { x: 0, y: 7 },
    { x: 3, y: 16 },
  ],
};

export default function ModeGlyph({ mode }: { mode: AgentMode }) {
  const reducedMotion = useReducedMotion();
  const dots = MODE_SHAPES[mode];

  return (
    <span aria-hidden className="relative h-[19px] w-[19px] shrink-0">
      {dots.map((dot, index) => (
        <motion.i
          key={index}
          className="absolute left-0 top-0 block h-[3px] w-[3px] rounded-full bg-current"
          initial={false}
          animate={{
            x: dot.x,
            y: dot.y,
            opacity: dot.opacity ?? 1,
            scale: dot.scale ?? 1,
          }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  type: 'spring',
                  stiffness: 360,
                  damping: 25,
                  mass: 0.42,
                  delay: index * 0.018,
                }
          }
        />
      ))}
    </span>
  );
}
