export interface VoicePreviewSample {
  url: string;
  duration: number;
  levelInterval: number;
  levels: string;
}

export type VoicePreviewState = {
  voice: string | null;
  phase: 'idle' | 'loading' | 'playing' | 'error';
};

export class VoicePreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private sample: VoicePreviewSample | null = null;
  private voice: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onChange: (state: VoicePreviewState) => void,
    private readonly createAudio: () => HTMLAudioElement = () => new Audio(),
  ) {}

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose = () => {
    this.clearTimer();
    const audio = this.audio;
    this.audio = null;
    this.sample = null;
    this.voice = null;
    if (!audio) return;
    audio.onplaying = audio.onended = audio.onerror = audio.onwaiting = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  stop = () => {
    this.dispose();
    this.onChange({ voice: null, phase: 'idle' });
  };

  toggle = async (voice: string, sample: VoicePreviewSample) => {
    if (this.audio && this.voice === voice) {
      this.stop();
      return;
    }
    this.dispose();
    const audio = this.createAudio();
    this.audio = audio;
    this.sample = sample;
    this.voice = voice;
    const fail = () => {
      if (this.audio !== audio) return;
      this.dispose();
      this.onChange({ voice, phase: 'error' });
    };
    const waiting = () => {
      if (this.audio !== audio) return;
      this.clearTimer();
      this.onChange({ voice, phase: 'loading' });
      this.timer = setTimeout(fail, 12_000);
    };
    audio.onplaying = () => {
      if (this.audio !== audio) return;
      this.clearTimer();
      this.onChange({ voice, phase: 'playing' });
    };
    audio.onwaiting = waiting;
    audio.onended = () => {
      if (this.audio === audio) this.stop();
    };
    audio.onerror = fail;
    audio.preload = 'none';
    audio.src = sample.url;
    waiting();
    try {
      await audio.play();
    } catch {
      fail();
    }
  };

  // 使用样音实际 RMS 包络，避免跨域音频分析依赖及每帧 React 更新。
  readLevels = () => {
    const { audio, sample } = this;
    if (
      !audio ||
      !sample ||
      audio.paused ||
      !Number.isFinite(audio.currentTime)
    )
      return { input: 0, output: 0 };
    const index = Math.max(
      0,
      Math.floor(audio.currentTime / sample.levelInterval),
    );
    const level = parseInt(sample.levels[index] ?? '0', 16) / 15;
    return { input: 0, output: Number.isFinite(level) ? level : 0 };
  };
}
