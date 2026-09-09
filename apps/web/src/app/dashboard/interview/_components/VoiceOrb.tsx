'use client';

import React, { useEffect, useRef, useState } from 'react';
import VoiceOrbCanvas, { type VoiceOrbProps } from './VoiceOrbCanvas';
import { LIQUID_ORB_WGSL, UNIFORM_SEED, U } from './liquidOrbShader';
import { ORB_LERP, orbFrame, type OrbParams } from './orbStates';

export type { VoiceOrbProps };

/**
 * 语音面试的主视觉：一颗液态玻璃球（WebGPU）。
 *
 * shader 在 `liquidOrbShader.ts`、状态语汇在 `orbStates.ts`，这里只做三件事：
 * **建设备、逐帧把参数写进 uniform、拿不到 WebGPU 就退回 canvas 版**。
 */

/** 参数逐帧向目标逼近；直接赋值会在切状态时「啪」地跳一下。 */
const lerp = (from: number, to: number, k: number) => from + (to - from) * k;

export default function VoiceOrb({
  readLevels,
  phase,
  className,
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // rAF 里读最新值，不靠闭包——否则每次 props 变都要重启渲染循环。
  const stateRef = useRef({ readLevels, phase });
  stateRef.current = { readLevels, phase };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof navigator === 'undefined' || !navigator.gpu) {
      setFailed(true);
      return;
    }

    let raf = 0;
    let device: GPUDevice | null = null;
    let disposed = false;
    // 退回 canvas 版时必须**同时把循环停掉**：effect 的依赖是 `[]`，
    // `failed` 变 true 只换子树、不会触发清理，否则 rAF 会继续对着一个
    // 已从 DOM 摘掉的 canvas 画下去（并且每帧 `getCurrentTexture()` 抛错）。
    const giveUp = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      device?.destroy();
      setFailed(true);
    };

    const start = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const context = canvas.getContext('webgpu');
      if (!adapter || !context) return giveUp();
      const gpu = await adapter.requestDevice();
      // 拿到设备的过程里组件可能已经卸载，这时清理函数早跑过、看到的还是 null。
      if (disposed) return gpu.destroy();
      device = gpu;

      const format = navigator.gpu.getPreferredCanvasFormat();
      // 球是透明背景上的一个圆，rgb 已在 shader 里乘过 alpha。
      context.configure({ device: gpu, format, alphaMode: 'premultiplied' });

      const shader = gpu.createShaderModule({ code: LIQUID_ORB_WGSL });
      const compilation = await shader.getCompilationInfo();
      if (compilation.messages.some((m) => m.type === 'error')) return giveUp();
      if (disposed) return;

      const pipeline = gpu.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shader, entryPoint: 'vs_main' },
        fragment: { module: shader, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      const values = new Float32Array(UNIFORM_SEED);
      const uniformBuffer = gpu.createBuffer({
        size: values.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = gpu.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      // 设备可能被系统回收（切换显卡、驱动重置）。丢了就退回 canvas 版，
      // 而不是留一块黑方块在界面中间。
      void gpu.lost.then(giveUp);

      // shader 里 `t = time * speed`，所以**不能逐帧改 speed**：那会把已经过去的
      // 时间一起重新缩放，画面每次变状态都跳一下。改成自己累积已缩放的时间，
      // uniform 里的 speed 固定为 1，倍率就只影响之后的帧。
      const baseSpeed = UNIFORM_SEED[U.speed];
      values[U.speed] = 1;

      let time = 0;
      let elapsed = 0;
      let last = performance.now();
      const silent = { input: 0, output: 0 };
      /** 平滑中的静息值，逐帧向当前状态逼近。初值即基准，所以入场不会先跳一下。 */
      const cur: OrbParams = orbFrame('idle', silent, 0).resting;
      /** 真正写进 uniform 的那一份：`cur` 叠上未经二次平滑的音频分量。 */
      const shown: OrbParams = { ...cur };
      /**
       * 电平的平滑跟随：**起得快、落得慢**。
       *
       * 起得快，声音一来球立刻有反应；落得慢，音节之间的停顿不会让它抽搐——
       * 人说话每个字之间都有静音帧，跟着原始 RMS 走会抖成筛子。
       */
      let inLevel = 0;
      let outLevel = 0;
      const follow = (v: number, target: number) =>
        v + (target - v) * (target > v ? 0.35 : 0.06);

      const frame = (now: number) => {
        if (disposed) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        elapsed += dt;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const { readLevels: read, phase: mode } = stateRef.current;
        const raw = read();
        inLevel = follow(inLevel, raw.input);
        outLevel = follow(outLevel, raw.output);

        const { resting, live } = orbFrame(
          mode,
          { input: inLevel, output: outLevel },
          elapsed,
        );
        /*
         * **静息值 lerp，音频分量直接叠加。**
         *
         * lerp 是给状态切换用的（listening→thinking 不要「啪」地跳）。若把音频分量也
         * 一起 lerp，它就被二次低通了——一级 attack/release 已经平滑过一次，再叠 0.09，
         * 4Hz 的音节速率只剩 10-15%，屏幕上就是「波动太小」。
         */
        for (const key of Object.keys(cur) as Array<keyof OrbParams>) {
          cur[key] = lerp(cur[key], resting[key], ORB_LERP);
          shown[key] = cur[key] + (live[key] - resting[key]);
        }

        // 速度是唯一不能写进 uniform 的：shader 里 `t = time * speed`，改 speed 会把
        // **已经过去的时间**一起重新缩放，每次切状态画面都跳一下。改成自己累积已缩放
        // 的时间、uniform 里 speed 固定为 1，倍率就只影响之后的帧。别改回去。
        time += dt * baseSpeed * cur.speedScale;

        values[U.width] = w;
        values[U.height] = h;
        values[U.time] = time;
        values[U.radius] = shown.radius;
        values[U.zoom] = shown.zoom;
        values[U.warp] = shown.warp;
        values[U.ridgeAmt] = shown.ridgeAmt;
        values[U.sheen] = shown.sheen;
        values[U.gloss] = shown.gloss;
        values[U.exposure] = shown.exposure;
        values[U.edgeGlow] = shown.edgeGlow;
        values[U.glassOpacity] = shown.glassOpacity;
        values[U.contourDeform] = shown.contourDeform;
        gpu.queue.writeBuffer(uniformBuffer, 0, values);

        const encoder = gpu.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        gpu.queue.submit([encoder.finish()]);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    void start().catch(giveUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      device?.destroy();
    };
  }, []);

  if (failed) {
    return (
      <VoiceOrbCanvas
        readLevels={readLevels}
        phase={phase}
        className={className}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
