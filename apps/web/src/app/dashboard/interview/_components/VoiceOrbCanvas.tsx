'use client';

import React, { useEffect, useRef } from 'react';
import type { VoiceLevels } from './audioLevels';
import type { OrbPhase } from './orbStates';

/**
 * 语音面试主视觉的**回退实现**：Canvas 2D 画的流体球。
 *
 * 主实现是 `VoiceOrb`（WebGPU 液态玻璃）。这一版在浏览器没有 WebGPU、或设备初始化
 * 失败时顶上——那不是小众场景：Firefox 与部分 Linux/旧 GPU 至今拿不到 `navigator.gpu`，
 * 而面试正开着的时候球突然不见了，比它没那么好看糟得多。
 *
 * ## 形态
 *
 * **清晰的圆形轮廓 + 内部柔和的流动**。上一版是一条高斯模糊的莫比乌斯带，问题在于
 * 它没有边界——模糊把形状化开，整体读起来是一团雾而不是一个「对象」。而这颗球要
 * 承担的是"面试官在这里"这件事，它需要一个明确的身体。
 *
 * 做法：几团缓慢漂移的径向渐变画进离屏画布，整体模糊一次，再**裁进一个圆**。
 * 模糊只发生在圆内，边缘因此是干净的；云在里面流动，像液体封在球里。
 *
 * ## 状态要能一眼看出来
 *
 * 三种状态的差别不是颜色，是**运动本身**——颜色区分要靠记忆，运动不用：
 *
 * | 状态 | 运动 |
 * |---|---|
 * | 在听 | 极缓的漂移 + 随你的音量轻微起伏。安静时几乎是静的 |
 * | 思考中 | 收缩一点，内部加速搅动。像在往里使劲 |
 * | 面试官在说 | 整体呼吸，云被推到边缘再回落 |
 *
 * 用 canvas 而不是 framer-motion：每一帧的形状由音量和时间重新算出来，
 * 没有可插值的起止状态可言。
 */

/** 内部的云团数。三团就够出层次，多了糊成一片。 */
const BLOBS = 3;

export interface VoiceOrbProps {
  /**
   * 两路电平，**由球在自己的 rAF 里按需读取**——不走 props 的数值、不走 React state。
   * 那是 60fps 的连续量，进 state 就是每秒 60 次重渲染。
   */
  readLevels: () => VoiceLevels;
  phase: OrbPhase;
  className?: string;
}

export default function VoiceOrbCanvas({
  readLevels,
  phase,
  className,
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // rAF 里读最新值，不靠闭包——否则每次 props 变都要重启动画循环。
  const stateRef = useRef({ readLevels, phase });
  stateRef.current = { readLevels, phase };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const offscreen = document.createElement('canvas');
    const off = offscreen.getContext('2d');
    if (!off) return;

    let raf = 0;
    let time = 0;
    /** 音量的平滑跟随。原始电平会让球随每个音节抽搐。 */
    let energy = 0;
    /** 状态之间的过渡量，0=听 1=想。突变会显得机械。 */
    let think = 0;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = offscreen.width = w;
        canvas.height = offscreen.height = h;
      }

      const { readLevels: read, phase: mode } = stateRef.current;
      const speaking = mode === 'speaking';
      const thinking = mode === 'thinking';
      const idle = mode === 'idle' || mode === 'connecting';

      // 谁在说就跟谁：说话时跟面试官的输出，其余时候跟你的麦克风。
      const levels = read();
      const target = speaking ? levels.output : levels.input;
      energy += (target - energy) * (target > energy ? 0.3 : 0.05);
      think += ((thinking ? 1 : 0) - think) * 0.06;

      // 思考时转得快、听的时候几乎静止。速度差本身就是状态的信号。
      time += 0.0025 + think * 0.011 + energy * 0.009;

      const cx = w / 2;
      const cy = h / 2;
      // 思考时略微收缩，说话时随音量涨——「往里使劲」和「往外推」是两个方向。
      const radius =
        (Math.min(w, h) / 2) * (0.9 - think * 0.06 + energy * 0.05);

      off.clearRect(0, 0, w, h);
      off.globalCompositeOperation = 'source-over';

      // 底色：整体偏冷的暗蓝，作为云的背景，圆才不会是个透明的洞。
      const base = off.createLinearGradient(cx, cy - radius, cx, cy + radius);
      base.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
      base.addColorStop(1, 'rgba(14, 40, 60, 0.9)');
      off.fillStyle = base;
      off.beginPath();
      off.arc(cx, cy, radius, 0, Math.PI * 2);
      off.fill();

      // 云团：各自沿不同频率的李萨如轨迹漂移，永不重复同一个位置。
      off.globalCompositeOperation = 'lighter';
      for (let i = 0; i < BLOBS; i += 1) {
        const phaseOffset = (i / BLOBS) * Math.PI * 2;
        const drift = 0.34 + think * 0.16 + energy * 0.12;
        const bx =
          cx + Math.cos(time * (1.1 + i * 0.37) + phaseOffset) * radius * drift;
        const by =
          cy + Math.sin(time * (0.8 + i * 0.51) + phaseOffset) * radius * drift;
        const size = radius * (0.62 + 0.1 * Math.sin(time * 1.7 + i));
        const cloud = off.createRadialGradient(bx, by, 0, bx, by, size);
        const alpha = (idle ? 0.22 : 0.34 + energy * 0.2) * (1 - i * 0.18);
        cloud.addColorStop(0, `rgba(233, 248, 255, ${alpha.toFixed(3)})`);
        cloud.addColorStop(0.55, `rgba(125, 211, 252, ${(alpha * 0.5).toFixed(3)})`);
        cloud.addColorStop(1, 'rgba(125, 211, 252, 0)');
        off.fillStyle = cloud;
        off.beginPath();
        off.arc(bx, by, size, 0, Math.PI * 2);
        off.fill();
      }

      ctx.clearRect(0, 0, w, h);

      // 外发光：球体之外的一圈弥散，让它看起来在发亮而不是贴在背景上。
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.8,
        cx,
        cy,
        radius * 1.7,
      );
      const haloAlpha = 0.1 + energy * 0.14;
      halo.addColorStop(0, `rgba(56, 189, 248, ${haloAlpha.toFixed(3)})`);
      halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // 裁成圆之后再画：模糊只发生在圆内，边缘因此是干净的一条弧，
      // 而不是像上一版那样被模糊化开、失去轮廓。
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.filter = `blur(${((radius / 9) | 0) + 4}px)`;
      ctx.drawImage(offscreen, 0, 0);
      ctx.filter = 'none';
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
