/**
 * 把技能/语言的等级文本(自由文本,如 "精通"/"Advanced"/"B2"/"90%"/"4")归一化为 0–1 比例,
 * 供带 `levelBar` 的模板画进度条。识别不了就返回 null(调用方回退成纯文本)。
 *
 * 无任何依赖 —— 供 HTML 渲染器(CompactList)与 PDF 渲染器共同 import。
 */
const LEVEL_FRACTIONS: Record<string, number> = {
  // 中文
  '母语': 1, '精通': 1, '熟练': 0.82, '掌握': 0.72, '熟悉': 0.62, '良好': 0.6, '一般': 0.45, '了解': 0.4, '入门': 0.3, '基础': 0.35,
  // 英文
  native: 1, expert: 1, fluent: 0.9, advanced: 0.85, proficient: 0.8, professional: 0.78,
  'upper intermediate': 0.7, intermediate: 0.6, conversational: 0.5, elementary: 0.4, basic: 0.35, beginner: 0.3, novice: 0.25,
  // CEFR
  c2: 1, c1: 0.85, b2: 0.7, b1: 0.55, a2: 0.4, a1: 0.25,
};

export function skillLevelToFraction(level: string | undefined | null): number | null {
  if (!level) return null;
  const raw = String(level).trim().toLowerCase();
  if (!raw) return null;

  const pct = raw.match(/^(\d{1,3})\s*%$/);
  if (pct) return Math.min(1, Math.max(0, Number(pct[1]) / 100));

  const num = Number(raw);
  if (Number.isFinite(num)) {
    if (num > 0 && num <= 1) return num;
    if (num > 1 && num <= 5) return num / 5;
    if (num > 5 && num <= 100) return num / 100;
  }

  if (raw in LEVEL_FRACTIONS) return LEVEL_FRACTIONS[raw];
  for (const key of Object.keys(LEVEL_FRACTIONS)) {
    if (key.length > 1 && raw.includes(key)) return LEVEL_FRACTIONS[key];
  }
  return null;
}
