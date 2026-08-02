'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { fetchOrders, fetchSubscription } from '@/lib/extensions/billing-client';
import type {
  OrderHistoryRow,
  SubscriptionSummary,
} from '@/lib/billing/types';
import { OrderHistoryTable } from './_components/OrderHistoryTable';
import { SubscriptionCard } from './_components/SubscriptionCard';

/**
 * Where the renewal emails land.
 *
 * All three of them — 立即续期 / 重新订阅 / 更新支付方式 — used to point at
 * `/dashboard/settings`, which opens the settings modal and bounces to the
 * dashboard. That modal has no billing section at all, so the entire renewal
 * funnel of a manual-renewal product ended on a panel about API keys.
 *
 * This page answers the two questions someone arriving from those emails has:
 * what am I on right now, and what have I actually paid.
 */
export default function BillingPage() {
  const { t } = useTranslation();
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(
    null,
  );
  const [orders, setOrders] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both in parallel: they are independent reads and the page shows them
      // side by side, so serialising them only adds latency.
      const [sub, page] = await Promise.all([
        fetchSubscription(),
        fetchOrders(1, 50),
      ]);
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
    <div className="flex-1 overflow-y-auto bg-desk">
      {/* same container as the resume library so the page titles align */}
      <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {t('billingPage.title')}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            {t('billingPage.subtitle')}
          </p>
        </header>

        <div className="max-w-3xl space-y-10">
          {error ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <p>{t('billingPage.loadFailed')}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300"
              >
                {t('billingPage.retry')}
              </button>
            </div>
          ) : null}

          <SubscriptionCard subscription={subscription} loading={loading} />

          <section>
            <h2 className="mb-3 text-base font-semibold text-neutral-100">
              {t('billingPage.ordersTitle')}
            </h2>
            <OrderHistoryTable orders={orders} loading={loading} />
          </section>

          <footer className="border-t border-neutral-800 pt-6 text-sm text-neutral-500">
            {t('billingPage.refundHint')}{' '}
            <Link
              href="/legal/refund"
              className="text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300"
            >
              {t('billingPage.refundPolicy')}
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
