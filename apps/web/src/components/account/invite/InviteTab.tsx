'use client';

import React, { useEffect, useState } from 'react';
import { Gift, Users } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { useAccountUiStore } from '@/store/useAccountUiStore';

type Overview = {
  code: string;
  invited: number;
  rewarded: number;
  pending: number;
  remainingRewards: number;
};

/**
 * 账户里的「邀请有礼」——**看数据的地方，不是分享的地方**。
 *
 * 分享动作（链接、海报）整块搬去了 `InvitePosterModal`，由编辑器 header 的礼物按钮
 * 打开。理由是位置决定用途：账户弹窗的第五个 tab 是人主动来翻的，适合"我邀了多少人"
 * 这种回看；而"现在就去分享"必须在人干活的路上。
 *
 * **不显示积分数字**：服务端只回「本次到账相当于档位额度的百分之多少」，原始余额与
 * 上限永不离开服务器——与 `remainingPercent` 是同一个决定。
 */
export default function InviteTab() {
  const { t } = useTranslation();
  const openPoster = useAccountUiStore((s) => s.openInvitePoster);
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/billing/referrals/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const payload = json?.data ?? json;
        if (alive && payload) setData(payload);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />;
  }

  const stats = [
    { k: 'invited', v: data.invited },
    { k: 'rewarded', v: data.rewarded },
    { k: 'pending', v: data.pending },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* 数字用大字号：这一页存在的理由就是这三个数，其余都是注脚 */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ k, v }) => (
          <div key={k} className="rounded-xl bg-white/[0.03] px-4 py-3.5">
            <div className="text-[26px] font-semibold leading-none tabular-nums text-white">
              {v}
            </div>
            <div className="mt-1.5 text-[12px] text-neutral-500">
              {t(`account.invite.stats.${k}`)}
            </div>
          </div>
        ))}
      </div>

      {/* 一个人都没邀请过时，三个零说明不了任何事——补一句告诉他从哪开始。 */}
      {data.invited === 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-sky-400/[0.06] px-4 py-3.5 ring-1 ring-sky-400/[0.14]">
          <Users size={16} className="mt-0.5 shrink-0 text-sky-400" />
          <p className="text-[13px] leading-relaxed text-sky-100/90">
            {t('account.invite.emptyHint')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openPoster}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-[13px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 cursor-pointer"
        >
          <Gift size={14} />
          {t('account.invite.headerAction')}
        </button>
        <span className="text-[12px] text-neutral-500">
          {t('account.invite.remaining', { count: data.remainingRewards })}
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-neutral-500">{t('account.invite.rule')}</p>
    </div>
  );
}
