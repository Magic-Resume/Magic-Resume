'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { OrderHistoryRow } from '@/lib/billing/types';

/**
 * Money is rendered in the currency it was charged in, never converted.
 *
 * There is no FX rate anywhere in this system — the same reason the admin
 * revenue report reports per currency instead of adding ¥ to $. A receipt that
 * silently restates what someone paid in another currency is worse than one
 * that makes them read two rows.
 */
function formatAmount(amountCents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amountCents / 100);
  } catch {
    // An unknown ISO code must still render the number rather than blow up the
    // whole table.
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * 账单 ID。**屏幕上给短的，剪贴板里给全的。**
 *
 * 这两件事的受众不同：屏幕上要的是「能区分开同一天的六笔」，末 8 位就够；而发给客服
 * 要的是「能粘贴的完整串」。cuid 有 25 位，整串塞进表格会把金额和状态挤出可视区。
 */
function OrderIdCell({ id }: { id: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={id}
      aria-label={t('account.billing.copyOrderId')}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded font-mono text-[12px] transition-colors cursor-pointer',
        copied ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'
      )}
    >
      {id.slice(-8)}
      {copied ? (
        <Check size={12} className="shrink-0" />
      ) : (
        <Copy size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const STATUS_STYLES: Record<OrderHistoryRow['status'], string> = {
  paid: 'text-emerald-400',
  pending: 'text-amber-400',
  failed: 'text-neutral-500',
  refunded: 'text-neutral-400',
};

export function OrderHistoryTable({
  orders,
  loading,
}: {
  orders: OrderHistoryRow[];
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'zh-CN';

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-11 animate-pulse rounded-lg bg-white/[0.04]"
          />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-white/[0.06] px-4 py-6 text-center text-[13px] text-neutral-500">
        {t('account.billing.noOrders')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-[11.5px] uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-2.5 font-medium">{t('account.billing.colDate')}</th>
            <th className="px-4 py-2.5 font-medium">{t('account.billing.colOrderId')}</th>
            <th className="px-4 py-2.5 font-medium">{t('account.billing.colItem')}</th>
            <th className="px-4 py-2.5 font-medium">
              {t('account.billing.colAmount')}
            </th>
            <th className="px-4 py-2.5 font-medium">
              {t('account.billing.colChannel')}
            </th>
            <th className="px-4 py-2.5 font-medium">
              {t('account.billing.colStatus')}
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="border-b border-white/[0.04] last:border-0"
            >
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">
                {/* paidAt when it went through, createdAt when it did not —
                    an abandoned checkout still has a date worth showing. */}
                {formatDate(order.paidAt ?? order.createdAt, locale)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <OrderIdCell id={order.id} />
              </td>
              <td className="px-4 py-2.5 text-neutral-200">
                {order.planName ?? t('account.billing.unknownItem')}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-200">
                {formatAmount(order.amountCents, order.currency, locale)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">
                {t(`account.billing.channel.${order.channel}`, {
                  defaultValue: order.channel,
                })}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-2.5 ${STATUS_STYLES[order.status] ?? 'text-neutral-400'}`}
              >
                {t(`account.billing.status.${order.status}`, {
                  defaultValue: order.status,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
