'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAccountUiStore } from '@/store/useAccountUiStore';
import type { SubscriptionSummary } from '@/lib/billing/types';

/**
 * What the customer is on right now, and the one button that changes it.
 *
 * The renewal emails send people here to act, so the action has to be on this
 * page rather than one more hop away: `openPricing()` is the same modal the
 * account menu opens, so there is a single checkout surface.
 *
 * `past_due` and `suspended` get their own wording on purpose. A bounced card
 * keeps its plan through a grace window on the server side, so telling someone
 * their subscription had simply "ended" would be both wrong and the opposite of
 * what we want them to do about it.
 */
export function SubscriptionCard({
  subscription,
  loading,
}: {
  subscription: SubscriptionSummary | null;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const openPricing = useAccountUiStore((s) => s.openPricing);

  if (loading) {
    return <div className="h-28 animate-pulse rounded-xl bg-neutral-900/70" />;
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(i18n.language || 'zh-CN', {
        dateStyle: 'long',
      }).format(new Date(subscription.currentPeriodEnd))
    : null;

  const dunning =
    subscription?.status === 'past_due' || subscription?.status === 'suspended';

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-neutral-500">
            {t('billingPage.currentPlan')}
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-50">
            {subscription?.plan?.name ?? t('billingPage.freePlan')}
          </p>

          {dunning ? (
            <p className="mt-2 text-sm text-amber-400">
              {t('billingPage.paymentFailed')}
            </p>
          ) : subscription?.cancelAtPeriodEnd && periodEnd ? (
            <p className="mt-2 text-sm text-neutral-400">
              {t('billingPage.endsOn', { date: periodEnd })}
            </p>
          ) : periodEnd ? (
            <p className="mt-2 text-sm text-neutral-400">
              {t('billingPage.renewsOn', { date: periodEnd })}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={openPricing}
          className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-sky-400"
        >
          {subscription
            ? t('billingPage.manageCta')
            : t('billingPage.upgradeCta')}
        </button>
      </div>
    </section>
  );
}
