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

type Phase = 'waiting' | 'paid' | 'already_paid' | 'timeout' | 'error';

function ReturnState() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');

  const [phase, setPhase] = useState<Phase>('waiting');
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept in a ref, not state: the polling effect must not restart (and reset the
  // clock) every time the attempt count changes.
  const attempts = useRef(0);
  const failures = useRef(0);

  const settle = useCallback(
    (next: OrderSummary | null) => {
      if (!next || next.status !== 'paid') return false;
      setOrder(next);

      // Paid on the very first look means the order was already settled before
      // this page opened — a refresh or a revisited link, not money arriving.
      // Repeating "1000 credits added" there reads as a second top-up, which is
      // exactly what did NOT happen: fulfilment is idempotent on the order id.
      const arrivedNow = attempts.current > 1;
      setPhase(arrivedNow ? 'paid' : 'already_paid');
      if (arrivedNow) {
        // The wallet just changed, so the cached entitlement is stale — drop it
        // before anything reads "you have no credits" from the old snapshot.
        invalidateEntitlementCache();
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    if (!orderId) {
      setPhase('error');
      setError(t('billing.return.missingOrder'));
      return;
    }

    let alive = true;
    const startedAt = Date.now();

    const tick = async () => {
      if (!alive) return;
      attempts.current += 1;

      try {
        if (settle(await fetchOrder(orderId))) return;

        if (SYNC_AT_ATTEMPTS.has(attempts.current)) {
          if (settle(await syncOrder(orderId))) return;
        }
        failures.current = 0;
      } catch (e) {
        failures.current += 1;
        setError(e instanceof Error ? e.message : String(e));
        if (failures.current >= FAILURES_BEFORE_ERROR) {
          setPhase('error');
          return;
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
  }, [orderId, settle, t]);

  const backToDashboard = () => router.push('/dashboard');

  if (phase === 'paid') {
    return (
      <Panel
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title={t('billing.return.paidTitle')}
        detail={
          order?.credits
            ? t('billing.return.paidDetail', { credits: order.credits })
            : undefined
        }
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
