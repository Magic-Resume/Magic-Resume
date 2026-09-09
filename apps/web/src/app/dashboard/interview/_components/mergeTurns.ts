import type { VoiceTurn } from './useVoiceInterview';

/**
 * 把两个来源的对话拼成一条时间线。
 *
 * 面试官的话有**两个来源**，而且会重叠：
 *   - HTTP：`start` 的开场白、以及房间连不上时 `chat` 的回复
 *   - LiveKit：agent 把同一句念出来，转写再送回来
 *
 * 开场白必然两边都有——服务端先返回它、worker 再取同一段文本念出来。直接拼接就是
 * 一模一样的两条挨在一起（截图里那样）。
 *
 * 只比对**接缝处**：`seeded` 的尾巴与 `live` 的头。往深了比会误伤——面试官在一场里
 * 重复追问同一句是正常的，那两句之间隔着你的回答，不是重复而是催问。
 */
export function mergeInterviewTurns(
  seeded: VoiceTurn[],
  live: VoiceTurn[],
): VoiceTurn[] {
  if (seeded.length === 0 || live.length === 0) return [...seeded, ...live];

  const tail = seeded[seeded.length - 1];
  const head = live[0];
  const sameUtterance =
    tail.role === head.role && tail.text.trim() === head.text.trim();

  // 留 live 那一条：它带 segmentId，后续的补发定稿要靠它认领。
  return sameUtterance
    ? [...seeded.slice(0, -1), ...live]
    : [...seeded, ...live];
}
