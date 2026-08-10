'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { buildInviteUrl, composeInvitePoster, POSTER_SRC } from '@/lib/utils/invite-poster';

type Overview = {
  code: string;
  invited: number;
  rewarded: number;
  pending: number;
  /** 单次奖励相当于一个月免费额度的百分之多少。 */
  rewardPercent: number | null;
  remainingRewards: number;
};

/**
 * 邀请 tab。
 *
 * **不显示积分数字**：服务端只回「本次到账相当于档位额度的百分之多少」，原始余额与
 * 上限永不离开服务器——这与 `remainingPercent` 是同一个决定。「+33% 额度」也确实比
 * 「50000 积分」更能让人算出值多少钱：后者用户根本无从判断。
 */
export default function InviteTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/billing/referrals/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (alive && json) setData(json.data ?? json);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const inviteUrl = data ? buildInviteUrl(data.code) : '';

  const copy = useCallback(() => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [inviteUrl]);

  const savePoster = useCallback(async () => {
    if (!inviteUrl || busy) return;
    setBusy(true);
    try {
      const blob = await composeInvitePoster(inviteUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'magic-resume-invite.png';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('poster compose failed:', error);
      toast.error(t('account.invite.posterError'));
    } finally {
      setBusy(false);
    }
  }, [inviteUrl, busy, t]);

  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-5">
        <div>
          <h3 className="text-[15px] font-semibold text-white">
            {t('account.invite.title')}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
            {data.rewardPercent
              ? t('account.invite.subtitle', { percent: data.rewardPercent })
              : t('account.invite.subtitleNoQuota')}
          </p>
        </div>

        {/* 链接与二维码海报是两个场景：微博 / 私聊发链接，朋友圈 / 群发图。 */}
        <div>
          <label className="mb-1.5 block text-[12px] text-neutral-500">
            {t('account.invite.linkLabel')}
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-neutral-950/60 px-3 py-2 font-mono text-[13px] text-neutral-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors cursor-pointer',
                copied
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-white/[0.06] text-neutral-200 hover:bg-white/[0.1]'
              )}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('account.invite.copied') : t('account.invite.copy')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { k: 'invited', v: data.invited },
            { k: 'rewarded', v: data.rewarded },
            { k: 'pending', v: data.pending },
          ].map(({ k, v }) => (
            <div key={k} className="rounded-xl bg-white/[0.03] px-3.5 py-3">
              <div className="text-[20px] font-semibold tabular-nums text-white">{v}</div>
              <div className="mt-0.5 text-[12px] text-neutral-500">
                {t(`account.invite.stats.${k}`)}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[12px] leading-relaxed text-neutral-500">
          {t('account.invite.rule')}
        </p>
      </div>

      {/* 海报预览。点保存才合成——绝大多数人只是来复制链接的，不该为他们先跑一遍
          canvas 绘制。 */}
      <div className="space-y-2.5">
        <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
          {/* eslint-disable-next-line @next/next/no-img-element -- 同一张图要交给 canvas 合成，next/image 的包装拿不到原始元素 */}
          <img src={POSTER_SRC} alt={t('account.invite.posterAlt')} className="block w-full" />
        </div>
        <button
          type="button"
          onClick={savePoster}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-[13px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t('account.invite.savePoster')}
        </button>
        <p className="text-center text-[11.5px] text-neutral-500">
          {t('account.invite.posterHint')}
        </p>
      </div>
    </div>
  );
}
