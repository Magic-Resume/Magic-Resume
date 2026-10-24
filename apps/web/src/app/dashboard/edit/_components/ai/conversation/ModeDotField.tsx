'use client';

import React, { useEffect, useRef } from 'react';
import type { AgentMode } from './modes';
import { AGENT_MODES } from './modes';

/**
 * 模式条上的点阵场。
 *
 * 一层 canvas：点阵按当前模式的排布铺满整条带子；指针靠近时点阵被推开，
 * 按下 / 切换模式 / 开始听写时从一点泛出一圈涟漪。三个模式的排布不同（密排方点 /
 * 错位圆点 / 横向流动），所以「现在是什么模式」在余光里也成立，不必去读那行字。
 *
 * 参数是从设计稿（848px 宽、42px 条高）按 ×0.7 换算来的：涟漪扩张 126→88 px/s、
 * 高斯落差按距离平方缩 1150→563、推开幅度 6.5→4.6。距离项都是平方，所以缩放系数
 * 取 0.7²≈0.49 而不是 0.7——照抄 0.7 会让指针的影响范围明显偏大。
 *
 * 渲染循环常驻（这是选定的方案），但页面切到后台时停——rAF 在隐藏标签页里本来就
 * 会被节流，显式停掉省得它在唤醒瞬间补算一堆过期涟漪。
 */

type Ripple = { x: number; y: number; born: number; strength: number };

const RIPPLE_LIFE_MS = 1450;
const RIPPLE_SPEED = 88; // px/s
const POINTER_FALLOFF = 563; // exp(-d² / n)
const RIPPLE_BAND = 54;
const TRAIL_THROTTLE_MS = 82;
/**
 * 剪枝半径。满铺之后每帧要算的点翻了一倍多，而每个点还要遍历所有在飞的涟漪——
 * 不剪枝的话移动鼠标时是每秒上百万次 exp()。两个阈值都取到高斯贡献 < 2e-5 的位置，
 * 肉眼看不出差别，省掉的却是内层循环的绝大部分。
 */
const POINTER_CUTOFF = 60; // exp(-60²/563) ≈ 0.0017
const RIPPLE_CUTOFF = 24; // exp(-24²/54) ≈ 2e-5
/** 在飞涟漪的上限：轨迹涟漪按 82ms 节流、活 1450ms，正常最多 ~18 个。 */
const MAX_RIPPLES = 24;

export default function ModeDotField({
  mode,
  listening = false,
  cutout,
}: {
  mode: AgentMode;
  /** 听写中：点阵整体提一档能量，让「正在听」在余光里也成立。 */
  listening?: boolean;
  /**
   * 从 canvas 上挖掉输入井的形状（`top` 起、顶部两角半径 `radius`）。
   *
   * canvas 铺得比模式条高，才能让模式条底边与输入井圆角之间那两个夹角也吃到点阵；
   * 但多出来的部分会盖在输入井上，所以按井的形状挖空。用 destination-out 而不是
   * 靠层级压住：输入井底色是半透明的，只靠压层点阵会从井里透出来。
   */
  cutout?: { top: number; radius: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 循环里读的都是 ref：把它们放进依赖会让 rAF 每次渲染重启。
  const modeRef = useRef(mode);
  const listeningRef = useRef(listening);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointerRef = useRef({ x: 0, y: 0, active: false, down: false });
  const addRippleRef = useRef<(x: number, y: number, strength?: number) => void>(() => {});

  const cutoutRef = useRef(cutout);
  modeRef.current = mode;
  listeningRef.current = listening;
  cutoutRef.current = cutout;

  // 切模式 / 起听写时从左侧泛一圈——状态变化有个物理动作，而不是文字默默换掉。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    addRippleRef.current(28, canvas.clientHeight / 2, 0.72);
  }, [mode, listening]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let frame = 0;

    const addRipple = (x: number, y: number, strength = 1) => {
      if (reduced) return;
      const list = ripplesRef.current;
      if (list.length >= MAX_RIPPLES) list.shift();
      list.push({ x, y, born: performance.now(), strength });
    };
    addRippleRef.current = addRipple;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number) => {
      const meta = AGENT_MODES[modeRef.current];
      const [stepX, stepY] = meta.dots.spacing;
      const [red, green, blue] = meta.dots.rgb;
      const pointer = pointerRef.current;
      const lift = listeningRef.current ? 0.22 : 0;

      context.clearRect(0, 0, width, height);
      ripplesRef.current = ripplesRef.current.filter((r) => time - r.born < RIPPLE_LIFE_MS);

      // 铺满整条带子：从边缘起步、横向不截断也不淡出。左上角那块空缺是
      // rounded-t-[26px] 在 30px 高的带子上裁出来的楔形——网格铺到 x=0 之后，
      // 剩下的曲线边界就是容器自己的形状，读起来是「圆角」而不是「没铺满」。
      let row = 0;
      for (let y = 1; y < height; y += stepY, row += 1) {
        const rowOffset = meta.dots.stagger && row % 2 ? stepX * 0.5 : 0;
        const flow = meta.dots.flow && !reduced ? ((time * 0.013 + row * 3) % stepX) : 0;
        for (let x = 1 + rowOffset - flow; x < width; x += stepX) {
          let offsetX = 0;
          let offsetY = 0;
          let energy = lift;

          if (pointer.active) {
            const dx = x - pointer.x;
            const dy = y - pointer.y;
            if (Math.abs(dx) < POINTER_CUTOFF && Math.abs(dy) < POINTER_CUTOFF) {
            const distance = Math.hypot(dx, dy) || 1;
            const local = Math.exp(-(distance * distance) / POINTER_FALLOFF);
            const pressure = pointer.down ? 4.6 : 2.5;
            offsetX += (dx / distance) * local * pressure;
            offsetY += (dy / distance) * local * pressure;
            energy += local * (pointer.down ? 0.92 : 0.58);
            }
          }

          for (const ripple of ripplesRef.current) {
            const age = (time - ripple.born) / 1000;
            const radius = age * RIPPLE_SPEED;
            const dx = x - ripple.x;
            const dy = y - ripple.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (Math.abs(distance - radius) > RIPPLE_CUTOFF) continue;
            const band =
              Math.exp(-Math.pow(distance - radius, 2) / RIPPLE_BAND) *
              Math.max(0, 1 - age / (RIPPLE_LIFE_MS / 1000)) *
              ripple.strength;
            offsetX += (dx / distance) * band * 5;
            offsetY += (dy / distance) * band * 5;
            energy += band * 1.15;
          }

          const alpha = Math.min(0.92, 0.2 + energy * 0.66);
          const radius = Math.min(1.8, 0.85 + energy * 0.7);
          context.beginPath();
          context.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          context.fill();
        }
      }

      // 挖掉输入井：这一刀必须在点阵画完之后、下一帧之前。
      const hole = cutoutRef.current;
      if (hole && hole.top < height) {
        const { top, radius } = hole;
        context.save();
        context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        context.moveTo(radius, top);
        context.lineTo(width - radius, top);
        context.quadraticCurveTo(width, top, width, top + radius);
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.lineTo(0, top + radius);
        context.quadraticCurveTo(0, top, radius, top);
        context.closePath();
        context.fillStyle = '#000';
        context.fill();
        context.restore();
      }

      frame = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    resize();
    start();

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const updatePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current.x = e.clientX - rect.left;
    pointerRef.current.y = e.clientY - rect.top;
    pointerRef.current.active = true;
  };

  const trailRef = useRef(0);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // 指针事件挂在 canvas 自己身上（demo 挂在外层 header 上），这样它不用去算
      // 两个元素之间的坐标偏移,少一处会在布局变化时悄悄错位的地方。
      className="absolute inset-0 h-full w-full touch-none"
      onPointerEnter={updatePointer}
      onPointerMove={(e) => {
        updatePointer(e);
        const now = performance.now();
        if (now - trailRef.current > TRAIL_THROTTLE_MS) {
          const p = pointerRef.current;
          addRippleRef.current(p.x, p.y, p.down ? 0.72 : 0.3);
          trailRef.current = now;
        }
      }}
      onPointerDown={(e) => {
        updatePointer(e);
        pointerRef.current.down = true;
        addRippleRef.current(pointerRef.current.x, pointerRef.current.y, 1);
      }}
      onPointerUp={(e) => {
        pointerRef.current.down = false;
        if (e.pointerType !== 'mouse') pointerRef.current.active = false;
      }}
      onPointerCancel={() => {
        pointerRef.current.down = false;
        pointerRef.current.active = false;
      }}
      onPointerLeave={() => {
        pointerRef.current.down = false;
        pointerRef.current.active = false;
      }}
    />
  );
}
