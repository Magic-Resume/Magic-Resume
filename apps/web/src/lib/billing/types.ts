/**
 * Frontend mirror of the backend billing shapes (JSON-serialized).
 *
 * 积分是内部计费单位，任何字段都不对客户端暴露：这里只有计划类型、能不能用、
 * 剩余百分比。下面所有 credits/includedCredits 的缺席都是这条规则的结果。
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

export interface OrderSummary {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amountCents: number;
  currency: string;
  channel: string;
  paidAt?: string | null;
  createdAt?: string;
}

/** 买家自己的订单历史行：带计划名而非整个计划——收据只需要说明买了什么。 */
export interface OrderHistoryRow extends OrderSummary {
  planName: string | null;
  planKind: PlanKind | null;
}

export interface OrderHistoryPage {
  records: OrderHistoryRow[];
  total: number;
  current: number;
  size: number;
}

export interface OrderCheckout {
  orderId: string;
  /** `redirect` → 跳转到 payUrl；`qrcode` → 把 payUrl 渲染成二维码。 */
  kind: 'redirect' | 'qrcode';
  payUrl: string;
}

export interface SubscriptionSummary {
  id: string;
  planId: string;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  plan?: PlanSummary | null;
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
  /** 上次成功支付的渠道，仅用作渠道选择器的默认值；`manual`（线下记账）不会出现。 */
  lastPaidChannel?: string | null;
}
