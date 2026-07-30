'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchOrder,
  invalidateEntitlementCache,
  syncOrder,
} from '@/lib/extensions/billing-client';
import type { OrderSummary } from '@/lib/billing/types';

/** How often to ask our own API whether the order has landed. */
const POLL_MS = 2_000;
/** Give up after this long and tell the user to check back, rather than spinning forever. */
const TIMEOUT_MS = 60_000;
/**
 * Poll counts at which to also ask the channel directly.
 *
 * The async notification is the normal path and usually beats the browser back
 * here. These are the fallback for when it does not arrive at all — spaced out
 * because each one costs an upstream call, and bunched early because a
 * notification that has not landed in ~40s probably is not coming.
 */
const SYNC_AT_ATTEMPTS = new Set([4, 10, 20]);
/**
 * Consecutive failed polls before admitting something is wrong.
 *
 * One failure is noise. Failing every time is not "still waiting" — it is a
 * broken session or a down API, and saying "no notification yet" would blame
 * the payment channel for our own problem.
 */
const FAILURES_BEFORE_ERROR = 3;
/**
 * How far before this page opened a payment can have settled and still count as
 * "this checkout".
 *
 * Alipay's `notify_url` is server-to-server and routinely lands while the buyer
 * is still on the channel's page, so `paidAt` is often a little *older* than
 * this page. That window is a checkout's worth of time; a genuinely revisited
 * link is hours or days old, not minutes.
 */
const RECENT_PAYMENT_MS = 15 * 60_000;

type Phase = 'waiting' | 'paid' | 'already_paid' | 'timeout' | 'error';

function ReturnState() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');

  const [phase, setPhase] = useState<Phase>('waiting');
  const [error, setError] = useState<string | null>(null);
  // Kept in a ref, not state: the polling effect must not restart (and reset the
  // clock) every time the attempt count changes.
  const attempts = useRef(0);
  const failures = useRef(0);
  const openedAt = useRef(Date.now());
  // The effect must not list `t` as a dependency — see the poll below — but it
  // still needs the current translations.
  const tRef = useRef(t);
  tRef.current = t;

  const settle = useCallback(
    (next: OrderSummary | null) => {
      if (!next || next.status !== 'paid') return false;

      // Judged on when the payment settled, not on how many times we have
      // asked. "Paid on the first poll" was read as "this is a revisit", but it
      // is also the most common *successful* path: Alipay's notify is
      // server-to-server and usually beats the browser back here. Real buyers
      // were told "此前已完成付款并到账，本次没有重复扣款" about a purchase
      // they had just made.
      const paidAt = next.paidAt ? Date.parse(next.paidAt) : NaN;
      const arrivedNow =
        Number.isNaN(paidAt) || paidAt >= openedAt.current - RECENT_PAYMENT_MS;
      setPhase(arrivedNow ? 'paid' : 'already_paid');

      // Unconditional. This used to sit inside the `arrivedNow` branch, so the
      // misjudgement above also left the cached entitlement stale: the buyer
      // pressed "back to workspace" and saw their pre-purchase balance and
      // plan. Dropping a cache is idempotent — there is nothing to save by
      // skipping it.
      invalidateEntitlementCache();
      return true;
    },
    [],
  );

  useEffect(() => {
    if (!orderId) {
      setPhase('error');
      setError(tRef.current('billing.return.missingOrder'));
      return;
    }

    let alive = true;
    const startedAt = Date.now();

    const tick = async () => {
      if (!alive) return;
      attempts.current += 1;

      try {
        const order = await fetchOrder(orderId);
        // The main poll answered, so the failure streak is broken. This used to
        // sit after the sync below and inside the same `try`, which meant a
        // throwing sync both incremented the counter and skipped the reset —
        // three optional calls failing turned a perfectly healthy poll into
        // `error`, showing the buyer a raw upstream string at ~40s when the
        // honest ending was the 60s timeout copy.
        failures.current = 0;
        if (!alive) return;
        if (settle(order)) return;
      } catch (e) {
        failures.current += 1;
        setError(e instanceof Error ? e.message : String(e));
        if (failures.current >= FAILURES_BEFORE_ERROR) {
          setPhase('error');
          return;
        }
      }

      if (!alive) return;
      if (SYNC_AT_ATTEMPTS.has(attempts.current)) {
        try {
          const synced = await syncOrder(orderId);
          if (!alive) return;
          if (settle(synced)) return;
        } catch {
          // A best-effort fallback for a notification that never arrived. Its
          // failure says nothing about whether we are still waiting, so it gets
          // no say in the phase and no share of the poll's failure budget.
        }
      }

      if (!alive) return;
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    let timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `t` is deliberately absent. react-i18next hands back a new `t` when its
    // resources finish loading, which in practice happens at least once after
    // mount — and that restarted this effect, resetting `startedAt` and firing
    // an extra immediate poll, quietly extending the 60s ceiling the timeout
    // copy promises. It is read through `tRef` instead, for the same reason
    // `attempts` is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, settle]);

  const backToDashboard = () => router.push('/dashboard');

  if (phase === 'paid') {
    return (
      <Panel
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title={t('billing.return.paidTitle')}
        // Unconditional now, and it names no quantity: the buyer's own number of
        // credits is not something they can price, and it is not sent here.
        detail={t('billing.return.paidDetail')}
        action={{ label: t('billing.return.backToDashboard'), onClick: backToDashboard }}
      />
    );
  }

  if (phase === 'already_paid') {
    return (
      <Panel
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title={t('billing.return.alreadyPaidTitle')}
        detail={t('billing.return.alreadyPaidDetail')}
        action={{ label: t('billing.return.backToDashboard'), onClick: backToDashboard }}
      />
    );
  }

  if (phase === 'timeout') {
    return (
      <Panel
        icon={<Clock className="h-10 w-10 text-amber-500" />}
        title={t('billing.return.timeoutTitle')}
        // Deliberately not "payment failed": the money may well have been
        // taken. Alipay retries its notification for hours, so the order can
        // still settle on its own.
        detail={t('billing.return.timeoutDetail')}
        action={{ label: t('billing.return.backToDashboard'), onClick: backToDashboard }}
      />
    );
  }

  if (phase === 'error') {
    return (
      <Panel
        icon={<XCircle className="h-10 w-10 text-red-500" />}
        title={t('billing.return.errorTitle')}
        detail={error ?? undefined}
        action={{ label: t('billing.return.backToDashboard'), onClick: backToDashboard }}
      />
    );
  }

  return (
    <Panel
      icon={<Loader2 className="h-10 w-10 animate-spin text-ink-sky" />}
      title={t('billing.return.waitingTitle')}
      detail={t('billing.return.waitingDetail')}
    />
  );
}

function Panel({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-desk px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        {icon}
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {detail ? <p className="text-sm text-ink-muted">{detail}</p> : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 rounded-lg bg-ink-sky px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </main>
  );
}

/**
 * Landing page for the payment channel's `return_url`.
 *
 * The redirect only means the buyer finished at the cashier — it is not proof
 * of payment, and it carries no signature. The order is treated as paid solely
 * on what our own API says, which in turn only trusts the verified async
 * notification.
 */
export default function BillingReturnPage() {
  // useSearchParams needs a Suspense boundary, or `next build` fails trying to
  // prerender this route.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-desk">
          <Loader2 className="h-6 w-6 animate-spin text-ink-sky" />
        </main>
      }
    >
      <ReturnState />
    </Suspense>
  );
}
