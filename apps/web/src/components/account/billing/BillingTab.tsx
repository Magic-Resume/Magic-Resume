'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { fetchOrders, fetchSubscription } from '@/lib/extensions/billing-client';
import type { OrderHistoryRow, SubscriptionSummary } from '@/lib/billing/types';
import { OrderHistoryTable } from './OrderHistoryTable';
import { SubscriptionCard } from './SubscriptionCard';

/**
 * The 账单 tab of the account modal.
 *
 * Billing belongs with the account, not with settings: it is a fact about who
 * you are to us — what you are on, what you paid — rather than a preference for
 * how the app behaves. The modal's header already carries the usage cluster and
 * calls itself "the single place subscription info lives"; this is the rest of
 * that same story, and putting it anywhere else would give the product two
 * answers to "what am I paying for".
 *
 * Mounted only while the tab is active, so the fetch below is the tab being
 * opened rather than the modal being opened.
 */
export function BillingTab() {
  const { t } = useTranslation();
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both at once: independent reads shown together, so serialising them only
      // adds latency to a panel someone is already looking at.
      const [sub, page] = await Promise.all([fetchSubscription(), fetchOrders(1, 50)]);
      setSubscription(sub);
      setOrders(page.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-[13px] text-red-300">
          <p>{t('account.billing.loadFailed')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1.5 text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300"
          >
            {t('account.billing.retry')}
          </button>
        </div>
      )}

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="mb-4 text-[14px] font-medium text-neutral-100">
          {t('account.billing.planTitle')}
        </h3>
        <SubscriptionCard subscription={subscription} loading={loading} />
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="mb-4 text-[14px] font-medium text-neutral-100">
          {t('account.billing.ordersTitle')}
        </h3>
        <OrderHistoryTable orders={orders} loading={loading} />
        <p className="mt-4 text-[12px] text-neutral-500">
          {t('account.billing.refundHint')}{' '}
          <Link
            href="/legal/refund"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300"
          >
            {t('account.billing.refundPolicy')}
          </Link>
        </p>
      </section>
    </>
  );
}
