/** Keep the last partial minute visible instead of rounding it to zero. */
export function formatInterviewRemaining(
  seconds: number | null | undefined,
  language: string,
): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds))
    return null;
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  if (language.startsWith('en'))
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}
