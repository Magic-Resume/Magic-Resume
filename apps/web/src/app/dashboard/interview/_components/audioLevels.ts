'use client';

/**
 * 逐帧音量计。
 *
 * 为什么不用 livekit-client 的 `Participant.audioLevel`：那个值来自服务端节流的 speaker
 * 更新（几百毫秒一次），拿它驱动 60fps 的动画会得到一串台阶。**而且它只有本地那一路**——
 * 远端（面试官）说话时读到的是你自己的麦克风，接近 0。球此前「说话时按固定幅度呼吸、
 * 跟声音无关」就是这么来的。
 *
 * 这里直接在 Web Audio 里取时域 RMS，两路各一个，谁都不经过 React。
 */

/** RMS → 0-1 的增益。正常说话的 RMS 约 0.05-0.12，乘 8 落在 0.4-0.95，喊话才削顶。 */
const LEVEL_GAIN = 8;

export interface LevelMeter {
  /** 当前 RMS，已归一化并 clamp 到 0-1。 */
  read: () => number;
  close: () => void;
}

/**
 * 给一条 `MediaStreamTrack` 挂一个只读的音量计。
 *
 * **analyser 不接 `destination`。** 接了会让这条音轨被播放第二遍——远端音轨已经由
 * `track.attach()` 挂在 `<audio>` 元素上出声了，这里只是旁路取数。
 */
export function createLevelMeter(
  context: AudioContext,
  track: MediaStreamTrack,
): LevelMeter {
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  // 平滑交给球那边做（它有自己的 attack/release），这里给原始值。
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  return {
    read: () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      return Math.min(1, Math.sqrt(sum / buffer.length) * LEVEL_GAIN);
    },
    close: () => {
      source.disconnect();
      analyser.disconnect();
    },
  };
}

/** 两路电平：`input` = 候选人的麦克风，`output` = 面试官的声音。 */
export interface VoiceLevels {
  input: number;
  output: number;
}
