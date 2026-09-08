import type { Copy, Locale } from '../i18n/ui';

export type PlanId = 'free' | 'pro' | 'max';
export interface PricingPlan {
  id: PlanId;
  name: string;
  priceCents: number;
  currency: string;
  interval: 'month' | 'year' | null;
  tagline: string;
  features: string[];
  highlight: boolean;
}

/** Accept only a complete, locale-specific public price snapshot. Never infer an offer
 * from a base price: the signed-in billing API prices by payment channel. */
export function parsePricingSnapshot(payload: unknown, locale: Locale): PricingPlan[] | null {
  if (!payload || typeof payload !== 'object' || !('locale' in payload) || payload.locale !== locale || !('plans' in payload) || !Array.isArray(payload.plans) || payload.plans.length !== 3) return null;
  const ids = new Set<string>();
  const plans: PricingPlan[] = [];
  for (const plan of payload.plans) {
    if (!plan || typeof plan !== 'object' || !['free','pro','max'].includes(plan.id) || ids.has(plan.id)) return null;
    if (typeof plan.name !== 'string' || !plan.name.trim() || typeof plan.tagline !== 'string') return null;
    if (!Number.isSafeInteger(plan.priceCents) || plan.priceCents < 0 || (plan.id === 'free' ? plan.priceCents !== 0 : plan.priceCents === 0)) return null;
    if (typeof plan.currency !== 'string' || !/^[A-Z]{3}$/.test(plan.currency)) return null;
    if (![null,'month','year'].includes(plan.interval) || (plan.id !== 'free' && plan.interval === null)) return null;
    if (!Array.isArray(plan.features) || !plan.features.length || !plan.features.every((f: unknown) => typeof f === 'string' && f.trim() && !f.includes('{{'))) return null;
    ids.add(plan.id);
    plans.push({id:plan.id,name:plan.name,priceCents:plan.priceCents,currency:plan.currency,interval:plan.interval,tagline:plan.tagline,features:plan.features,highlight:plan.highlight === true});
  }
  return plans.sort((a,b) => ['free','pro','max'].indexOf(a.id)-['free','pro','max'].indexOf(b.id));
}

export async function loadPricing(copy: Copy, locale: Locale, endpoint?: string): Promise<PricingPlan[]> {
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set('locale', locale);
      const response = await fetch(url, {signal:AbortSignal.timeout(2500),headers:{Accept:'application/json'}});
      const plans = response.ok ? parsePricingSnapshot(await response.json(), locale) : null;
      if (plans) return plans;
    } catch { /* Public pricing is optional; local creation must stay available. */ }
  }
  return copy.landing.pricing.plans.map(plan => ({
    id:plan.id as PlanId,name:plan.id === 'free' ? 'Free' : plan.id === 'pro' ? 'Pro' : 'Max',
    ...FALLBACK_PRICE[locale][plan.id as PlanId],
    tagline:plan.tagline,features:plan.features,highlight:plan.id === 'pro',
  }));
}

/**
 * 拿不到 endpoint 时的价格。**不是占位数**——这是两个结算渠道的实际月付价,
 * 少了它 48px 的价格位就只能写「应用内查看」,而那一格正是这一屏的全部力量。
 * 语言在这里当地区用:中文页走人民币渠道,英文页走美元渠道。
 */
const FALLBACK_PRICE: Record<Locale, Record<PlanId, Pick<PricingPlan, 'priceCents' | 'currency' | 'interval'>>> = {
  zh: {
    free: {priceCents:0,currency:'CNY',interval:null},
    pro: {priceCents:1900,currency:'CNY',interval:'month'},
    max: {priceCents:4900,currency:'CNY',interval:'month'},
  },
  en: {
    free: {priceCents:0,currency:'USD',interval:null},
    pro: {priceCents:399,currency:'USD',interval:'month'},
    max: {priceCents:999,currency:'USD',interval:'month'},
  },
};
