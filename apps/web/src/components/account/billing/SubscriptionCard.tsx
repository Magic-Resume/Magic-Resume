"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { useAccountUiStore } from "@/store/useAccountUiStore";
import type { SubscriptionSummary } from "@/lib/billing/types";

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

  if (loading) {
    return (
      <div>
        <div className="h-5 w-40 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-2.5 h-4 w-56 animate-pulse rounded bg-white/[0.04]" />
      </div>
    );
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(i18n.language || "zh-CN", {
        dateStyle: "long",
      }).format(new Date(subscription.currentPeriodEnd))
    : null;

  const dunning =
    subscription?.status === "past_due" || subscription?.status === "suspended";

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-neutral-100">
          {planName ?? t("account.billing.freePlan")}
        </p>

        {dunning ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-400">
            {t("account.billing.paymentFailed")}
          </p>
        ) : subscription?.cancelAtPeriodEnd && periodEnd ? (
          <p className="mt-1.5 text-[12.5px] text-neutral-500">
            {t("account.billing.endsOn", { date: periodEnd })}
          </p>
        ) : periodEnd ? (
          <p className="mt-1.5 text-[12.5px] text-neutral-500">
            {t("account.billing.renewsOn", { date: periodEnd })}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={openPricing}
        className="h-9 shrink-0 rounded-full border border-white/15 px-4 text-[13px] font-medium text-neutral-100 transition-colors hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
      >
        {subscription
          ? t("account.billing.manageCta")
          : t("account.billing.upgradeCta")}
      </button>
    </div>
  );
}
