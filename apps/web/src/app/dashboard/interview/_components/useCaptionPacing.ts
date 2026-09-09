'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 把面试官的字幕按语速摊开，让它跟着声音走。
 *
 * ## 为什么要在浏览器这边做
 *
 * 框架自带的字幕同步器按**音节数**配速（`hyphenateWord` + 3.83 音节/秒），而那套分词是
 * 英文的：中文没有空格，整句被当成一个词、一个音节。实测 38 个中文字它认为 0.3 秒就该
 * 念完，实际要念约 10 秒——**差 30 倍**，于是整句瞬间吐完，跑到语音前面去了。
 *
 * 改不了它：`@livekit/agents` 没有 subpath exports，够不到内部的同步器；`RoomOutputOptions`
 * 也没有透出分词配置。
 *
 * ## 为什么这个做法对中英文都对
 *
 * 我们节流的是**已经拿到手的文本**。框架已经配好速的（英文）永远不会在缓冲区里积压，
 * 这一层就是空操作；被整块吐出来的（中文）才会被摊开。不需要判断语言。
 */

/**
 * 每秒吐几个字。
 *
 * 实测我们这把音色（`zh_male_m191_uranus_bigtts`）的三段语料：5.22 / 5.62 / 5.40 字每秒。
 * 取 5.4。宁可略快于语音——字幕比声音慢一点点是自然的（人本来就先听到后读到），
 * 快一点就会重现「字都读完了它还在念」。
 */
export const CHARS_PER_SECOND = 5.4;

/**
 * 这一帧该显示到第几个字。抽成纯函数只为可测——配速错了不会报错，只会悄悄跑到声音前面。
 *
 * **不设「落后太多就跳着追」的上限。** 我一开始写了一个，测试立刻打脸：面试官的句子
 * 普遍 40-50 字、整块到达，任何合理的上限都会让它每次跳掉大半，配速形同虚设。
 * 文本先于音频整块到达**是这里的常态，不是异常**；真正的上界是「说完就把剩下的吐完」，
 * 那个由 `active` 转 false 管着，不需要第二道。
 *
 * @param shownChars 已显示的字数
 * @param totalChars 已收到的字数
 * @param dt         距上一帧的秒数
 */
export function nextShownChars(
  shownChars: number,
  totalChars: number,
  dt: number,
): number {
  if (totalChars <= shownChars) return shownChars;
  return Math.min(totalChars, shownChars + dt * CHARS_PER_SECOND);
}

/**
 * 文本到了但迟迟没开口，等多久就不等了。
 *
 * 实测热连接下首字 1354ms、TTS 首包直连约 800ms / 走美国 VPN 2134ms。取 2.5s 覆盖正常
 * 路径。这条兜底是为了让「`speaking` 没来」退化成「字幕早了一点」，而不是**一个字都不显示**。
 */
const SPEAK_GRACE_MS = 2500;

/**
 * 这一段字幕走到哪一步了。
 *
 * **必须三态，不能靠 `active` 一个布尔**：`!active` 有两种含义相反的情形——开口前的
 * 「还没开始」与收尾后的「已经念完」。此前不分，一律把全文吐出去；而文本永远先于音频
 * 到达（LLM 出字 → TTS 合成 → 才响），于是每一句都成了「字一次性蹦出来，然后才开始念」。
 */
export type CaptionStage = 'waiting' | 'running' | 'done';

/**
 * 这一帧该处于哪一步。抽成纯函数只为可测——**走错这条状态机不会报错**，
 * 只会悄悄退回「字一次性蹦完、然后才开始念」，而那正是它要修的 bug。
 */
export function nextStage(
  stage: CaptionStage,
  active: boolean,
): CaptionStage {
  if (active) return 'running';
  // 没出过声就继续等。这里若写成 `'done'`，就等于把「还没开始」当成「已经念完」。
  return stage === 'running' ? 'done' : stage;
}

/**
 * @param full   目前收到的完整文本（每次都是全量，不是增量）
 * @param active 面试官是否**正在出声**（`lk.agent.state === 'speaking'`）。
 */
export function useCaptionPacing(full: string, active: boolean): string {
  const [shown, setShown] = useState('');
  const [stage, setStage] = useState<CaptionStage>('waiting');
  const shownRef = useRef(0);
  const fullRef = useRef(full);
  fullRef.current = full;

  // 换了一段话（新一轮）就从头开始。用「不再是前缀」判断，因为同一段是逐字追加的。
  useEffect(() => {
    if (!full.startsWith(shown)) {
      shownRef.current = 0;
      setShown('');
      setStage('waiting');
    }
  }, [full, shown]);

  // 出声即开跑；停声即收尾（只有跑过的才算收尾，没开过口的继续等）。
  useEffect(() => {
    setStage((s) => nextStage(s, active));
  }, [active]);

  // 兜底：文本到了但 `speaking` 迟迟不来（TTS 失败、状态属性没广播）。到点自己开跑，
  // 让它退化成「字幕早了一点」，而不是**一个字都不显示**。
  useEffect(() => {
    if (stage !== 'waiting' || !full) return;
    const timer = setTimeout(() => setStage('running'), SPEAK_GRACE_MS);
    return () => clearTimeout(timer);
  }, [stage, full]);

  useEffect(() => {
    // 还没开口：一个字都不吐，等声音起来再逐字追。
    if (stage === 'waiting') return;

    if (stage === 'done') {
      // 念完了：剩下的一次性给出去。声音都停了还在挤字，比不同步更怪。
      shownRef.current = fullRef.current.length;
      setShown(fullRef.current);
      return;
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = fullRef.current;
      const lag = target.length - shownRef.current;

      if (lag > 0) {
        shownRef.current = nextShownChars(shownRef.current, target.length, dt);
        setShown(target.slice(0, Math.floor(shownRef.current)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  return shown;
}
