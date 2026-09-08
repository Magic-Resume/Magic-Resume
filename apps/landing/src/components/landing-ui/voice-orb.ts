/// <reference types="@webgpu/types" />
/**
 * 语音面试那颗球。**主实现是 WebGPU 液态玻璃**,和 web 应用跑的是同一份 WGSL
 * (`liquid-orb-shader.ts`)与同一套状态语汇(`orb-states.ts`)——那两份从
 * `apps/web/.../interview/_components` 原样搬来,数值一个没动。
 *
 * 拿不到 `navigator.gpu`(Firefox、部分旧 GPU)时退回 Canvas 2D 那份,也是应用里
 * 的同一条回退路径。回退要**换一个 canvas 元素**:一块画布只能有一种上下文,
 * webgpu 拿过就再也拿不到 2d。
 */
import { LIQUID_ORB_WGSL, UNIFORM_SEED, U } from './liquid-orb-shader';
import {
  ORB_LERP,
  orbFrame,
  type OrbParams,
  type OrbPhase,
} from './orb-states';

export type { OrbPhase };
export interface OrbState {
  phase: OrbPhase;
  /** 你的麦克风电平 0-1。落地页没有麦克风,由调用方给脚本化包络。 */
  input: number;
  /** 面试官的输出电平 0-1。 */
  output: number;
}

const lerp = (from: number, to: number, k: number) => from + (to - from) * k;

/** 电平的平滑跟随:**起得快、落得慢**。音节之间的静音帧会让球抖成筛子。 */
const follow = (value: number, target: number) =>
  value + (target - value) * (target > value ? 0.35 : 0.06);

/** 在 host 里铺一块新画布。回退时旧的那块必须整个换掉。 */
function mountCanvas(host: HTMLElement): HTMLCanvasElement {
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  return canvas;
}

export function startVoiceOrb(
  host: HTMLElement,
  readState: () => OrbState,
): () => void {
  let disposed = false;
  let raf = 0;
  let device: GPUDevice | null = null;
  let stopFallback: (() => void) | undefined;

  const fallBack = () => {
    if (disposed) return;
    cancelAnimationFrame(raf);
    device?.destroy();
    device = null;
    stopFallback = startCanvasOrb(mountCanvas(host), readState);
  };

  const canvas = mountCanvas(host);
  const context = navigator.gpu ? canvas.getContext('webgpu') : null;
  if (!context) {
    stopFallback = startCanvasOrb(mountCanvas(host), readState);
    return () => {
      disposed = true;
      stopFallback?.();
    };
  }

  void (async () => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return fallBack();
    const gpu = await adapter.requestDevice();
    // 拿设备的过程里可能已经被停掉了,这时清理函数早跑过、看到的还是 null。
    if (disposed) return gpu.destroy();
    device = gpu;

    const format = navigator.gpu.getPreferredCanvasFormat();
    // 球是透明背景上的一个圆,rgb 已在 shader 里乘过 alpha。
    context.configure({ device: gpu, format, alphaMode: 'premultiplied' });

    const shader = gpu.createShaderModule({ code: LIQUID_ORB_WGSL });
    const compilation = await shader.getCompilationInfo();
    if (compilation.messages.some((message) => message.type === 'error'))
      return fallBack();
    if (disposed) return;

    const pipeline = gpu.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
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
    // 设备会被系统回收(切显卡、驱动重置)。丢了就退回 canvas 版,
    // 而不是在版面中间留一块黑方块。
    void gpu.lost.then(fallBack);

    // shader 里 `t = time * speed`,所以**不能逐帧改 speed**:那会把已经过去的时间
    // 一起重新缩放,每次切状态画面都跳一下。自己累积已缩放的时间,uniform 里 speed
    // 固定为 1,倍率就只影响之后的帧。别改回去。
    const baseSpeed = UNIFORM_SEED[U.speed];
    values[U.speed] = 1;

    let time = 0;
    let elapsed = 0;
    let last = performance.now();
    let inLevel = 0;
    let outLevel = 0;
    const silent = { input: 0, output: 0 };
    /** 平滑中的静息值,逐帧向当前状态逼近。初值即基准,入场不会先跳一下。 */
    const cur: OrbParams = orbFrame('idle', silent, 0).resting;
    /** 真正写进 uniform 的那一份:`cur` 叠上未经二次平滑的音频分量。 */
    const shown: OrbParams = { ...cur };

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

      const raw = readState();
      inLevel = follow(inLevel, raw.input);
      outLevel = follow(outLevel, raw.output);
      const { resting, live } = orbFrame(
        raw.phase,
        { input: inLevel, output: outLevel },
        elapsed,
      );

      /*
       * **静息值 lerp,音频分量直接叠加。**
       *
       * lerp 是给状态切换用的(listening→thinking 不要「啪」地跳)。若把音频分量也
       * 一起 lerp,它就被二次低通了——一级 attack/release 已经平滑过一次,再叠 0.09,
       * 4Hz 的音节速率只剩 10-15%,屏幕上就是「波动太小」。
       */
      for (const key of Object.keys(cur) as Array<keyof OrbParams>) {
        cur[key] = lerp(cur[key], resting[key], ORB_LERP);
        shown[key] = cur[key] + (live[key] - resting[key]);
      }
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
  })().catch(fallBack);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    device?.destroy();
    stopFallback?.();
  };
}

/** 内部的云团数。三团就够出层次,多了糊成一片。 */
const BLOBS = 3;

function startCanvasOrb(
  canvas: HTMLCanvasElement,
  readState: () => OrbState,
): () => void {
  const ctx = canvas.getContext('2d');
  const offscreen = document.createElement('canvas');
  const off = offscreen.getContext('2d');
  if (!ctx || !off) return () => {};

  let raf = 0;
  let time = 0;
  /** 音量的平滑跟随。原始电平会让球随每个音节抽搐。 */
  let energy = 0;
  /** 状态之间的过渡量,0=听 1=想。突变会显得机械。 */
  let think = 0;
  let running = true;
  /** 声波环的自走时钟。不能挂在 time 上——那个的步长随状态变。 */
  let pulse = 0;

  const draw = () => {
    if (!running) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = offscreen.width = w;
      canvas.height = offscreen.height = h;
    }

    const state = readState();
    const speaking = state.phase === 'speaking';
    const thinking = state.phase === 'thinking';

    // 谁在说就跟谁:说话时跟面试官的输出,其余时候跟你的麦克风。
    const target = speaking ? state.output : state.input;
    energy += (target - energy) * (target > energy ? 0.3 : 0.05);
    think += ((thinking ? 1 : 0) - think) * 0.06;

    // 思考时转得快、听的时候几乎静止。速度差本身就是状态的信号。
    time += 0.0025 + think * 0.011 + energy * 0.009;

    const cx = w / 2;
    const cy = h / 2;
    // 外发光要画到 1.7r,球必须留出这段余量——产品里画布是满屏的,这里不是,
    // 不留就会看到 halo 被画布裁出来的一个方块。
    const room = Math.min(w, h) / 2 / 1.75;
    // 思考时略微收缩,说话时随音量涨——「往里使劲」和「往外推」是两个方向。
    const radius = room * (0.9 - think * 0.06 + energy * 0.05);

    off.clearRect(0, 0, w, h);
    off.globalCompositeOperation = 'source-over';

    // 底色:淡蓝到近白的浅色球体。回退版原来是深蓝,那是配黑房间的;
    // 这里要对齐 WebGPU 那颗——浅色大理石,蓝丝在里面流。
    const base = off.createLinearGradient(cx, cy - radius, cx, cy + radius);
    base.addColorStop(0, 'rgba(226, 240, 255, 0.98)');
    base.addColorStop(0.55, 'rgba(198, 222, 250, 0.96)');
    base.addColorStop(1, 'rgba(232, 243, 255, 0.98)');
    off.fillStyle = base;
    off.beginPath();
    off.arc(cx, cy, radius, 0, Math.PI * 2);
    off.fill();

    // 云团:各自沿不同频率的李萨如轨迹漂移,永不重复同一个位置。
    off.globalCompositeOperation = 'source-over';
    for (let i = 0; i < BLOBS; i += 1) {
      const phaseOffset = (i / BLOBS) * Math.PI * 2;
      const drift = 0.34 + think * 0.16 + energy * 0.12;
      const bx =
        cx + Math.cos(time * (1.1 + i * 0.37) + phaseOffset) * radius * drift;
      const by =
        cy + Math.sin(time * (0.8 + i * 0.51) + phaseOffset) * radius * drift;
      const size = radius * (0.62 + 0.1 * Math.sin(time * 1.7 + i));
      const cloud = off.createRadialGradient(bx, by, 0, bx, by, size);
      const alpha = 0.34 + energy * 0.2 - i * 0.06;
      cloud.addColorStop(0, `rgba(233, 248, 255, ${alpha.toFixed(3)})`);
      cloud.addColorStop(
        0.55,
        `rgba(125, 211, 252, ${(alpha * 0.5).toFixed(3)})`,
      );
      cloud.addColorStop(1, 'rgba(125, 211, 252, 0)');
      off.fillStyle = cloud;
      off.beginPath();
      off.arc(bx, by, size, 0, Math.PI * 2);
      off.fill();
    }

    ctx.clearRect(0, 0, w, h);
    pulse = (pulse + 0.0042) % 1;

    // 说话时向外推的三圈声波。
    if (state.phase === 'speaking') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = Math.max(1, radius * 0.012);
      for (let k = 0; k < 3; k += 1) {
        const t = (pulse + k / 3) % 1;
        const alpha = (1 - t) * 0.16 * (0.35 + energy * 0.65);
        ctx.strokeStyle = `rgba(125, 200, 250, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (1.02 + t * 0.62), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 外发光:球体之外的一圈弥散,让它看起来在发亮而不是贴在背景上。
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(
      cx,
      cy,
      radius * 0.8,
      cx,
      cy,
      radius * 1.7,
    );
    const haloAlpha = 0.14 + energy * 0.16;
    halo.addColorStop(0, `rgba(56, 189, 248, ${haloAlpha.toFixed(3)})`);
    halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // 裁成圆之后再画:模糊只发生在圆内,边缘因此是干净的一条弧。
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.filter = `blur(${((radius / 9) | 0) + 4}px)`;
    ctx.drawImage(offscreen, 0, 0);
    ctx.filter = 'none';

    // 球体打光。三层都以光源为同心:两个圆心不同的 radialGradient 会画出锥形,
    // 那正是上一版球上那道月牙的来源。
    const lx = cx - radius * 0.38;
    const ly = cy - radius * 0.42;
    const shade = ctx.createRadialGradient(
      lx,
      ly,
      radius * 0.15,
      lx,
      ly,
      radius * 2.05,
    );
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    shade.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    shade.addColorStop(1, 'rgba(38, 74, 124, 0.32)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    // 边缘再压一点:球才坐得住,不然像一张贴纸。
    const edge = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius);
    edge.addColorStop(0, 'rgba(28, 58, 98, 0)');
    edge.addColorStop(1, 'rgba(28, 58, 98, 0.26)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);

    // 高光:一团柔和的亮斑,不是一段弧——弧在球面上读起来是道棱。
    const spec = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius * 0.46);
    spec.addColorStop(
      0,
      `rgba(255, 255, 255, ${(0.46 + energy * 0.22).toFixed(3)})`,
    );
    spec.addColorStop(
      0.6,
      `rgba(255, 255, 255, ${(0.1 + energy * 0.08).toFixed(3)})`,
    );
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();

    raf = requestAnimationFrame(draw);
  };

  raf = requestAnimationFrame(draw);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}
