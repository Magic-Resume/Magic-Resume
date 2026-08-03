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

const POLL_MS = 2_000;
const TIMEOUT_MS = 60_000;
/** 第几次轮询时顺带直接问渠道——异步通知才是常态，这只是它没来时的兜底，每次都要一次上游调用。 */
const SYNC_AT_ATTEMPTS = new Set([4, 10, 20]);
/** 连续失败几次才认定出错：单次失败是噪声，次次失败就不是"还在等"而是我们自己坏了。 */
const FAILURES_BEFORE_ERROR = 3;
/** 早于本页多久的支付仍算"这一单"：支付宝 notify 是服务端直连，paidAt 常比本页还早。 */
const RECENT_PAYMENT_MS = 15 * 60_000;

type Phase =
  | 'waiting'
  | 'paid'
  | 'already_paid'
  | 'failed'
  | 'refunded'
  | 'timeout'
  | 'error';

function ReturnState() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');

  const [phase, setPhase] = useState<Phase>('waiting');
  const [error, setError] = useState<string | null>(null);
  // 用 ref 不用 state：次数一变就重启轮询 effect 会把计时也重置掉。
  const attempts = useRef(0);
  const failures = useRef(0);
  const openedAt = useRef(Date.now());
  const tRef = useRef(t);
  tRef.current = t;

  const settle = useCallback(
    (next: OrderSummary | null) => {
      if (!next) return false;

      // 终态也要停：只认 'paid' 会让已失败/已退款的订单一路走到超时面板，
      // 对一笔明确失败的支付说"款项不会丢失，渠道会重试"。
      if (next.status === 'failed' || next.status === 'refunded') {
        setPhase(next.status);
        return true;
      }
      if (next.status !== 'paid') return false;

      // 按支付落账时间判定，不按轮询次数：首次轮询就已支付恰恰是最常见的**成功**路径，
      // 当成"重复访问"会对刚付完钱的买家说"此前已完成付款"。
      const paidAt = next.paidAt ? Date.parse(next.paidAt) : NaN;
      const arrivedNow =
        Number.isNaN(paidAt) || paidAt >= openedAt.current - RECENT_PAYMENT_MS;
      setPhase(arrivedNow ? 'paid' : 'already_paid');

      // 无条件失效：放进 arrivedNow 分支里会让买家返回工作台时看到买之前的余额和计划。
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
        // 主轮询答复了就清失败计数。这行必须在下面 sync 之前、且不能同处一个 try：
        // 否则可选调用抛错会既加计数又跳过清零，把健康的轮询判成 error。
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
          // 通知没来时的尽力兜底。它失败说明不了"是否还在等"，因此不参与 phase 判定、
          // 也不占轮询的失败额度。
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
    // 故意不依赖 `t`：react-i18next 资源加载完会换一个新的 `t`，会重启本 effect、
    // 重置计时并多打一次轮询，悄悄突破文案承诺的 60s 上限。改从 tRef 读。
  }, [orderId, settle]);

  const backToDashboard = () => router.push('/dashboard');

  if (phase === 'paid') {
    return (
      <Panel
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title={t('billing.return.paidTitle')}
        // 不提数量：积分数不下发到客户端。
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

  if (phase === 'failed' || phase === 'refunded') {
    return (
      <Panel
        icon={<XCircle className="h-10 w-10 text-red-500" />}
        title={t(`billing.return.${phase}Title`)}
        detail={t(`billing.return.${phase}Detail`)}
        action={{ label: t('billing.return.backToDashboard'), onClick: backToDashboard }}
      />
    );
  }

  if (phase === 'timeout') {
    return (
      <Panel
        icon={<Clock className="h-10 w-10 text-amber-500" />}
        title={t('billing.return.timeoutTitle')}
        // 故意不说"支付失败"：钱很可能已经扣了，支付宝的通知会重试数小时，订单还能自己落账。
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
 * 支付渠道 `return_url` 的落地页。
 *
 * 这个跳转只说明买家在收银台走完了流程——它不带签名，不是付款凭证。是否已付款只认
 * 我们自己的 API，而后者只信经过验签的异步通知。
 */
export default function BillingReturnPage() {
  // useSearchParams 必须包 Suspense，否则 next build 预渲染这条路由会失败。
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
