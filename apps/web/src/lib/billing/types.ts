/**
 * Frontend mirror of the backend billing shapes (JSON-serialized).
 *
 * 积分是内部计费单位，任何字段都不对客户端暴露：这里只有计划类型、能不能用、
 * 剩余百分比。下面所有 credits/includedCredits 的缺席都是这条规则的结果。
 *
 * 只留 billing 槽契约携带的形状：`Entitlement` 及它引用到的计划类型。订单、收据、
 * 结账、订阅只有渲染它们的界面才读，那些界面在商业包里，类型也随之搬到商业包的
 * `types.ts`。
 */

export type PlanKind = 'credit_pack' | 'subscription';

/** 选定渠道后要显示的价格——`PlanSummary.priceCents` 只是基准列表价，币种可能对不上买家。 */
export interface PlanOffer {
  channel: string;
  priceCents: number;
  currency: string;
}

/** 闭集而非自由 Lucide 名：`optimizePackageImports` 在构建期改写 barrel 导入，运行时选名会整包拖入或渲染不出。 */
export type PlanFeatureIcon =
  | 'sparkles'
  | 'zap'
  | 'calendar'
  | 'shield'
  | 'infinity'
  | 'gauge'
  | 'check';

export interface PlanFeatureRow {
  icon: PlanFeatureIcon;
  /** 可含 `{{modelCount}}`；每日/每周次数模板变量已停止使用。 */
  text: string;
}

export interface PlanCardCopy {
  /** 仅定价卡片上替代 `name`——`name` 不分语言。 */
  displayName?: string;
  tagline?: string;
  badge?: string;
  features?: PlanFeatureRow[];
}

export interface PlanSummary {
  id: string;
  name: string;
  kind: PlanKind;
  priceCents: number;
  currency: string;
  modelAllowlist: string[];
  /** 计划默认模型；旧 Core 响应缺席时仍按模型白名单回落。 */
  defaultModel?: string | null;
  interval?: string | null;
  isDefault: boolean;
  /** 每分钟请求数——各档之间唯一真正拉开差距的字段。 */
  rateLimitRpm: number;
  highlighted?: boolean;
  /** 运营配置的卡片文案，按 locale (`zh` / `en`) 全量下发；缺席=未配置，回落到内置文案。 */
  copy?: Record<string, PlanCardCopy>;
  /** 只出现在计划列表里；缺席=未加载，不代表"哪儿都不卖"。 */
  offers?: PlanOffer[];
}

/** GET /api/billing/ai-entitlement 的响应。 */
export interface Entitlement {
  mode: 'internal' | 'byok_required';
  /** 此刻能不能用内置 AI（仅由积分余额与模型可用性决定）。 */
  canUseInternal: boolean;
  reason?: string | null;
  currentPlan: PlanSummary | null;
  /** 月度额度还剩百分之多少 (0-100)；null = 无限。 */
  remainingPercent: number | null;
  resetAt?: string | null;
  availableModels?: string[];
  /** 为真表示这份列表没能与 relay 的可路由集对齐，可能含调不通的模型。 */
  catalogDegraded?: boolean;
  /** 上次成功支付的渠道，仅用作渠道选择器的默认值；`manual`（线下记账）不会出现。 */
  lastPaidChannel?: string | null;
}
