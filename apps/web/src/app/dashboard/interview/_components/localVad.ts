'use client';

/**
 * 端侧语音活动检测（Silero VAD，浏览器里跑）。
 *
 * gpt-voice 那条链路的轮次判定在上游——它拿到音频自己判断候选人说完没有，我们插不上手。
 * 这一层解决的是另一件事：**上游判完再告诉我们，要走一个跨境往返**，而在那之前，
 * 面试官还在说、球还在"讲话"的形态上，候选人已经开口了。本地判一次，界面和音量能
 * 立刻反应，不必等那个往返。
 *
 * 它**只是增强**：加载失败、模型取不到、浏览器不支持 AudioWorklet，面试都要照常进行。
 * 所以这里一律吞掉错误返回 null，调用方不需要 try。
 */

/**
 * 自托管资产路径（`public/vad/`）。
 *
 * 包的默认值指向 jsDelivr，而这条链路本来就跑在一个到境外抖动明显的网络上——
 * 面试开场卡在一个 CDN 上是最没道理的失败。模型 2.2MB + ORT 运行时 13.6MB，
 * 都在我们自己的域下，浏览器缓存之后只有第一次要付。
 */
const VAD_ASSET_PATH = '/vad/';

/** 与 OpenAI 网页端同一代（`silero-vad-v6`）。 */
const VAD_MODEL = 'v6' as const;

export interface LocalVadHandle {
  /** 幂等；重复调用安全。 */
  destroy: () => void;
}

export interface LocalVadInput {
  /** 已经拿到的麦克风流——不要让 VAD 自己再 `getUserMedia` 一次。 */
  stream: MediaStream;
  /** 复用面试那一个 AudioContext，避免多开一条音频图。 */
  audioContext: AudioContext;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
}

export async function startLocalVad(
  input: LocalVadInput,
): Promise<LocalVadHandle | null> {
  try {
    /*
     * 动态引入：16MB 的运行时不该进主包，只有真的走 gpt-voice 才下载。
     *
     * **深引 `dist/real-time-vad` 而不是包入口**：入口会连带拉进 `non-real-time-vad`，
     * 那条路径 import 的是 `onnxruntime-web` 全量包（含 WebGL/WebGPU 后端），而我们
     * 只跑一个 2MB 的 wasm 模型，用不到。这个包没有 exports map，深引是允许的。
     */
    const { MicVAD } = await import(
      '@ricky0123/vad-web/dist/real-time-vad'
    );

    const vad = await MicVAD.new({
      model: VAD_MODEL,
      baseAssetPath: VAD_ASSET_PATH,
      onnxWASMBasePath: VAD_ASSET_PATH,
      audioContext: input.audioContext,
      getStream: async () => input.stream,
      // 流的生命周期归面试那边管：VAD 停了不该把候选人的麦克风一起关掉。
      pauseStream: async () => undefined,
      resumeStream: async () => input.stream,
      startOnLoad: true,
      // `onSpeechRealStart` 而不是 `onSpeechStart`：后者在噪声上也会触发，
      // 而我们要用它压低面试官的声音——压错了比晚压更难受。
      onSpeechRealStart: input.onSpeechStart,
      onSpeechEnd: () => input.onSpeechEnd(),
      onVADMisfire: input.onSpeechEnd,
    });

    let destroyed = false;
    return {
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        void vad.destroy().catch(() => undefined);
      },
    };
  } catch (error) {
    console.warn('[interview voice] local VAD unavailable', error);
    return null;
  }
}
