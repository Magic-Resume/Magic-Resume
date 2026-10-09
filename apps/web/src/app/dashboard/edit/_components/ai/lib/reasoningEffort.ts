/**
 * 上游真正会收到的推理强度。规则与 Magic-Core relay 的就近映射一致：所选档位不被该模型
 * 支持时先往强的方向找最近的支持档，没有再往弱；没有数据就原样返回。
 */
const EFFORT_SCALE = ['low', 'medium', 'high', 'xhigh'] as const;

export type EffortLevel = (typeof EFFORT_SCALE)[number];

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_SCALE as readonly string[]).includes(value);
}

export function effectiveEffort(
  requested: string,
  supported: readonly string[] | undefined,
): string {
  if (!supported?.length || supported.includes(requested)) return requested;
  if (!isEffortLevel(requested)) return requested;
  const index = EFFORT_SCALE.indexOf(requested);
  const stronger = EFFORT_SCALE.slice(index + 1).find((level) =>
    supported.includes(level),
  );
  if (stronger) return stronger;
  const weaker = [...EFFORT_SCALE.slice(0, index)]
    .reverse()
    .find((level) => supported.includes(level));
  return weaker ?? requested;
}
