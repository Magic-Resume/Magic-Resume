'use client';

import React, { useState } from 'react';
import { openBillingPortal } from '@/lib/extensions/billing-client';
import { useTranslation } from 'react-i18next';
import { useAccountUiStore } from '@/store/useAccountUiStore';
import type { SubscriptionSummary } from '@/lib/billing/types';

/**
 * What the customer is on, and the one control that changes it.
 *
 * A bare row: it sits inside the account modal's own `Section` card, so drawing
 * a second border here would box a box.
 *
 * `past_due` and `suspended` get their own line on purpose. A bounced card
 * keeps its plan through a grace window server-side, so saying the subscription
 * had simply "ended" would be both wrong and the opposite of what we want the
 * customer to go and do about it.
 */
function formatPeriodEnd(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale || 'zh-CN', {
    dateStyle: 'long',
  }).format(date);
}

export function SubscriptionCard({
  planName,
  subscription,
  loading,
}: {
  /**
   * From the entitlement, which is what the modal header shows too. The
   * subscription row is NOT the answer to "what plan am I on": a free-tier user
   * has no row at all, and the row's own plan was absent from this endpoint for
   * as long as it existed. Reading two sources put "Max" and "免费版" on screen
   * at once.
   */
  planName: string | null;
  /** Only for what the row alone knows: period end, cancellation, dunning. */
  subscription: SubscriptionSummary | null;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const openPricing = useAccountUiStore((s) => s.openPricing);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = Boolean(
    subscription?.autoRenew && subscription.canManageBilling,
  );
  const manage = async () => {
    if (!canManage) {
      openPricing();
      return;
    }
    setOpening(true);
    setError(null);
    try {
      const url = await openBillingPortal();
      if (!url) throw new Error(t('account.billing.manageFailed'));
      window.location.assign(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('account.billing.manageFailed'),
      );
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="bg-mr-surface-soft h-5 w-40 animate-pulse rounded" />
        <div className="bg-mr-surface-subtle mt-2.5 h-4 w-56 animate-pulse rounded" />
      </div>
    );
  }

  // `format` throws RangeError on an Invalid Date, and this sits on the render
  // path with no error boundary — an unparseable date took down the whole tab.
  // The sibling `OrderHistoryTable.formatDate` already guards this way.
  const periodEnd = formatPeriodEnd(
    subscription?.currentPeriodEnd,
    i18n.language,
  );

  const dunning =
    subscription?.status === 'past_due' || subscription?.status === 'suspended';

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-mr-subtitle font-medium text-neutral-100">
          {planName ?? t('account.billing.freePlan')}
        </p>

        {dunning ? (
          <p className="text-mr-ui mt-1.5 leading-relaxed text-amber-400">
            {t('account.billing.paymentFailed')}
          </p>
        ) : subscription?.cancelAtPeriodEnd && periodEnd ? (
          <p className="text-mr-ui mt-1.5 text-neutral-500">
            {t('account.billing.endsOn', { date: periodEnd })}
          </p>
        ) : periodEnd ? (
          <p className="text-mr-ui mt-1.5 text-neutral-500">
            {t(
              subscription?.autoRenew === false
                ? 'account.billing.endsOnManual'
                : 'account.billing.renewsOn',
              { date: periodEnd },
            )}
          </p>
        ) : null}
      </div>

      {error && (
        <p role="alert" className="text-mr-caption text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={opening}
        onClick={() => void manage()}
        className="text-mr-caption hover:bg-mr-surface-soft h-9 shrink-0 rounded-full border border-white/15 px-4 font-medium text-neutral-100 transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
      >
        {canManage
          ? t('account.billing.manageCta')
          : t(
              subscription
                ? 'account.billing.renewCta'
                : 'account.billing.upgradeCta',
            )}
      </button>
    </div>
  );
}
