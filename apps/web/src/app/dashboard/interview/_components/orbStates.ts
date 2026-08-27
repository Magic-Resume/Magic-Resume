import { UNIFORM_SEED, U } from './liquidOrbShader';
import type { VoiceLevels } from './audioLevels';

/**
 * 球的状态语汇。
 *
 * 语音面试里球是候选人**唯一能读到的社交信号**——真人面试靠读表情判断「他在听吗、在记吗、
 * 在想吗」，语音把那条通道整个砍掉了，球要把它还回来。所以每一档的取值是按**社交语义**定的，
 * 不是按好不好看。
 *
 * ## 两条链路，必须分开
 *
 * `resting` 是这一档的静息值，调用方逐帧 lerp 过去——状态切换不能「啪」地跳。
 * `live` 在它之上叠加音频驱动的分量，**调用方直接施加、不再 lerp**。
 *
 * 合成一份的话，音频起伏会被 lerp 二次低通：一级 attack/release 已经平滑过一次，再叠一层
 * 0.09 的 lerp，4Hz 的音节速率只剩 10-15%——`contourDeform 0.4` 到屏幕上就只有 ±0.5%
 * 半径，等于没有。上一版就是这么"波动太小"的，问题不在增益不够，在滤波器串联。
 */

export type OrbPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'finished';

/** 可被状态调制的参数。键名对应 `U` 表，值是目标绝对值（不是增量）。 */
export type OrbParams = {
  speedScale: number;
  radius: number;
  zoom: number;
  warp: number;
  ridgeAmt: number;
  sheen: number;
  gloss: number;
  exposure: number;
  edgeGlow: number;
  glassOpacity: number;
  contourDeform: number;
};

/** 编辑器导出的基准值，所有状态都从这里出发。 */
const B = {
  radius: UNIFORM_SEED[U.radius],
  zoom: UNIFORM_SEED[U.zoom],
  warp: UNIFORM_SEED[U.warp],
  ridgeAmt: UNIFORM_SEED[U.ridgeAmt],
  sheen: UNIFORM_SEED[U.sheen],
  gloss: UNIFORM_SEED[U.gloss],
  exposure: UNIFORM_SEED[U.exposure],
  glassOpacity: UNIFORM_SEED[U.glassOpacity],
  contourDeform: UNIFORM_SEED[U.contourDeform],
} as const;

/**
 * 外发光的地板值，**永远不穿过 0**。
 *
 * 片元着色器末尾 `alpha = select(ballA, max(ballA, lum), edgeGlow > 0.0)`——穿零会换一套
 * alpha 算法，边缘会闪一下。代价是失去 `glow <= 0` 那条早退路径（球外像素少一次 length()），
 * 在我们这个尺寸下可以忽略。
 */
const GLOW_FLOOR = 0.02;

/**
 * 面试官说话时的反应幅度。
 *
 * 形状动画是这一档的主角：大小和亮度谁都能做，**轮廓变形做不了假**。frost 预设的轮廓
 * 强度系数是 0.09（`glsContourStrength()` 里 style < 15.5 那一支），所以基准的 0.04 只有
 * ±0.36% 半径起伏、肉眼等于没有；0.55 才是 ±5%。
 */
const OUT = {
  radius: 0.055,
  glow: 0.16,
  exposure: 0.07,
  sheen: 0.12,
  contourDeform: 0.55,
} as const;

/**
 * 你说话时的反应幅度——约为面试官的一半。
 *
 * 上一版把它压到几乎为零，理由是「一旦球跟着你的声音跳，『在听』就变成了『催你』」。
 * **那个判断是错的**：代价是你开口后 1.35 秒（火山首字的硬底）内屏幕上毫无回应，
 * 而球是我们手上唯一的零延迟通道（本地 Web Audio 取的 RMS，不过网络）。
 * 高压场景里「它听见我没有」远比「它会不会显得急」重要——真人面试官会点头，那不是催。
 *
 * 取一半是为了保住主次：面试官说话时的幅度仍明显更大，两者不会看混。
 */
const IN = {
  radius: 0.026,
  glow: 0.075,
  exposure: 0.032,
  contourDeform: 0.2,
} as const;

/** 静息呼吸的周期（秒）。接近平静时的呼吸节奏；快了像故障灯。 */
const BREATH_PERIOD = 4.4;
/** 等待时的呼吸：比待命略快、幅度大得多——那是「在忙」，不是「在等你」。 */
const IDLE_BREATH_PERIOD = 3.5;
/** 半径的起伏幅度（±）。4% 在 300px 的球上约 ±12px，一眼能看出在动。 */
const IDLE_BREATH_DEPTH = 0.04;
/** 思考时的脉动周期。比呼吸快，接近人掂量事情的节奏。 */
const THINK_PERIOD = 1.6;

const wave = (elapsed: number, period: number) =>
  0.5 + 0.5 * Math.sin((elapsed / period) * Math.PI * 2);

export interface OrbFrame {
  /** 这一档的静息值。调用方**逐帧 lerp** 过去，保证状态切换平滑。 */
  resting: OrbParams;
  /** 静息值 + 音频分量。调用方把两者之差**直接叠加**，不要再 lerp。 */
  live: OrbParams;
}

/**
 * 算出这一帧的目标。
 *
 * @param elapsed 已经过的秒数，给呼吸/脉动这类与音频无关的周期动画用。
 */
export function orbFrame(
  phase: OrbPhase,
  levels: VoiceLevels,
  elapsed: number,
): OrbFrame {
  const base: OrbParams = {
    speedScale: 1,
    radius: B.radius,
    zoom: B.zoom,
    warp: B.warp,
    ridgeAmt: B.ridgeAmt,
    sheen: B.sheen,
    gloss: B.gloss,
    exposure: B.exposure,
    edgeGlow: GLOW_FLOOR,
    glassOpacity: B.glassOpacity,
    contourDeform: B.contourDeform,
  };
  const still = (resting: OrbParams): OrbFrame => ({ resting, live: resting });

  switch (phase) {
    // 「我在，不急」——静默时缓慢呼吸（不能像死了），你一开口就明显跟上。
    case 'listening': {
      const breath = wave(elapsed, BREATH_PERIOD);
      const resting: OrbParams = {
        ...base,
        speedScale: 0.55,
        // 呼吸放在静息值里而不是音频分量里：它与你说不说话无关，
        // 而且周期 4.4s 远低于 lerp 的截止频率，不会被平滑掉。
        exposure: 0.9 + 0.05 * breath,
        radius: B.radius + 0.008 * breath,
        edgeGlow: GLOW_FLOOR + 0.02 * breath,
      };
      const v = levels.input;
      return {
        resting,
        live: {
          ...resting,
          radius: resting.radius + IN.radius * v,
          exposure: resting.exposure + IN.exposure * v,
          edgeGlow: resting.edgeGlow + IN.glow * v,
          contourDeform: resting.contourDeform + IN.contourDeform * v,
        },
      };
    }

    // 「你说的我听进去了」——收缩、内部加速、玻璃变薄让你更能看进去。
    // 这是整套设计里情绪最重的一拍：它说的不是「在加载」，是「我在掂量」。
    case 'thinking': {
      // 亮度脉动是这一档**唯一在小尺寸下仍读得出**的信号：展开对话时球缩到 0.28，
      // 那时半径变化只剩约 2px、轮廓形变 0.3px，等于没有；而明暗不随尺寸衰减。
      const pulse = wave(elapsed, THINK_PERIOD);
      return still({
        ...base,
        speedScale: 1.45,
        radius: B.radius - 0.035,
        zoom: 0.46,
        warp: 4.3,
        ridgeAmt: 0.6,
        glassOpacity: 0.34,
        contourDeform: 0.07,
        exposure: B.exposure * (0.82 + 0.18 * pulse),
        edgeGlow: GLOW_FLOOR + 0.05 * pulse,
      });
    }

    // 「轮到我」——轮廓、亮度、光晕全部跟着**输出**声音走。
    case 'speaking': {
      const resting: OrbParams = {
        ...base,
        speedScale: 1.1,
        radius: B.radius + 0.03,
      };
      const v = levels.output;
      return {
        resting,
        live: {
          ...resting,
          radius: resting.radius + OUT.radius * v,
          exposure: resting.exposure + OUT.exposure * v,
          sheen: resting.sheen + OUT.sheen * v,
          edgeGlow: resting.edgeGlow + OUT.glow * v,
          contourDeform: resting.contourDeform + OUT.contourDeform * v,
        },
      };
    }

    // 还没醒：玻璃发闷、没有高光。
    case 'connecting':
      return still({
        ...base,
        speedScale: 0.35,
        exposure: 0.55 + 0.07 * wave(elapsed, 4),
        gloss: B.gloss * 0.4,
        sheen: B.sheen * 0.4,
      });

    /*
     * 等待。**呼吸要看得见**——这是入场时唯一在动的东西，静止的球读起来就是卡死了。
     *
     * 缩放走 shader 的半径，不走外层 `scale`：那个属性已经被「展开对话时缩到 0.28」
     * 占着，两个动画叠在同一属性上会互相覆盖。走半径的好处是边缘光晕会跟着自然变化，
     * 不是生硬的放大缩小。
     *
     * 比待命更沉、更慢：等待时的呼吸要读作「在忙」，不是「在等你」。
     */
    case 'idle': {
      const breath = wave(elapsed, IDLE_BREATH_PERIOD);
      return still({
        ...base,
        speedScale: 0.3,
        radius: B.radius * (1 - IDLE_BREATH_DEPTH + 2 * IDLE_BREATH_DEPTH * breath),
        exposure: 0.72 + 0.08 * breath,
        edgeGlow: GLOW_FLOOR + 0.03 * breath,
      });
    }

    // 停住的正圆 = 视觉上的句号。速度衰减到 0 由调用方按时间做。
    case 'finished':
      return still({
        ...base,
        speedScale: 0,
        exposure: 0.6,
        contourDeform: 0,
      });
  }
}

/** 静息值向目标逼近的速度。约 250ms 落定；再快会显得机械，再慢会跟不上状态切换。 */
export const ORB_LERP = 0.09;
