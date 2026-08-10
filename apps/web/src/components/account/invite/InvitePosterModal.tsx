'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Download, Gift, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { isCloudMode } from '@/lib/config/app';
import { useAccountUiStore } from '@/store/useAccountUiStore';
import {
  buildInviteUrl,
  cachedInviteCode,
  composeInvitePoster,
  POSTER_SRC,
  rememberInviteCode,
} from '@/lib/utils/invite-poster';

/**
 * 邀请海报弹窗——**分享这件事的唯一入口**。
 *
 * 与账户里的「邀请有礼」tab 分工明确：那边是"我的战绩"（邀了多少人、到账多少），
 * 这边是"现在就去分享"。此前两者混在一起，结果是分享动作被埋在账户弹窗的第五个 tab
 * 里——一个要靠人主动去翻的位置，承载不了增长入口。
 *
 * 挂在 AccountUiHost（全局），所以编辑器 header 与账户 tab 可以打开同一个它，
 * 海报 UI 不必写两份。
 */
export default function InvitePosterModal() {
  const { t } = useTranslation();
  const open = useAccountUiStore((s) => s.invitePosterOpen);
  const close = useAccountUiStore((s) => s.closeInvitePoster);
  // 本地缓存优先：码是永不变化的常量，第二次开弹窗不该再等一次网络往返。
  const [code, setCode] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : cachedInviteCode()
  );
  const [copied, setCopied] = useState(false);
  // 合成后的成品。预览与下载共用同一份——预览若只显示底图，用户看到的是一个空白
  // 方块，会以为二维码没生成。
  const [poster, setPoster] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // 打开时才拉码：邀请码在服务端是惰性生成的，没打开过就不该替用户生成一个。
  //
  // 有缓存也照发这一次请求（后台校正），但**不阻塞**——首屏已经用缓存的码合成好了。
  // 之前是"等网络回来才开始合成"，那次往返（Next 路由 → 代理 → gateway → platform-api
  // → 数据库）才是"要转一会儿"的真正来源，合成本身只有几十毫秒。
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/billing/referrals/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const fresh = (json?.data ?? json)?.code;
        if (!alive || !fresh) return;
        rememberInviteCode(fresh);
        setCode((prev) => (prev === fresh ? prev : fresh));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  const inviteUrl = code ? buildInviteUrl(code) : '';

  // 拿到码就立刻合成：这张图是弹窗的主角，让它先于交互出现。objectURL 必须回收，
  // 否则每次开关都漏一份几百 KB 的位图。
  useEffect(() => {
    if (!inviteUrl) return;
    let alive = true;
    let created: string | null = null;
    composeInvitePoster(inviteUrl)
      .then((blob) => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setPoster({ blob, url: created });
      })
      .catch((error) => {
        console.error('poster compose failed:', error);
        setFailed(true);
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
    // 依赖只能是 inviteUrl。带上 poster 会让 setPoster 触发重跑，cleanup 随即把刚
    // 创建的那个 objectURL 当场吊销——图片就此变成破图。
  }, [inviteUrl]);

  const copy = useCallback(() => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [inviteUrl]);

  // 保存即下载已合成好的那份，不再算第二遍——预览看到的就是存下来的。
  const savePoster = useCallback(() => {
    if (!poster) return;
    const a = document.createElement('a');
    a.href = poster.url;
    a.download = 'magic-resume-invite.png';
    a.click();
  }, [poster]);

  if (!isCloudMode) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* z-200：与定价弹窗同一层。AI 实验室面板是 z-100/101，而这个弹窗可以从
              编辑器 header 打开——停在更低的层就是点了没反应。 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-200 bg-black/70 backdrop-blur-sm cursor-pointer"
          />
          <div className="pointer-events-none fixed inset-0 z-200 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              /* 单栏竖版：弹窗取海报自己的比例。上一版是左右分栏——一个 9:16 的物件
                 配一栏矮内容，短的那边必然漂在空里（实测右栏只占 43% 高度，空出 320px）。
                 那不是间距能救的，是形制选错了。没有第二栏，就不存在两栏不等高。 */
              /* 单栏，宽度取一个读着舒服的常数——**不跟海报走**。
                 上一版把弹窗宽绑死在海报宽上，结果整个弹窗被 9:16 拖成 253px 的窄条，
                 标题都截断了。海报的比例只该决定海报自己有多大。
                 max-h + 滚动是矮屏的安全阀：宁可让它滚，也不让按钮被挤出视口。 */
              className="pointer-events-auto max-h-[92vh] w-full max-w-[380px] overflow-y-auto rounded-2xl bg-desk p-6 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.07]"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/20">
                    <Gift size={15} />
                  </div>
                  {/* 复用按钮那句「邀请好友」：点进来的那颗按钮叫什么，开出来的弹窗
                      就该叫什么。长标题（「一起把简历改到能投」）是给账户里那一页当
                      章节标题的——那儿有副标题托着；这里紧挨图标，而且宣传语海报自己
                      已经在讲了，再说一遍是复述。 */}
                  <h2 className="min-w-0 truncate text-[14px] font-semibold tracking-tight text-white">
                    {t('account.invite.headerAction')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 海报是这一屏的主体。高度封顶、宽度按 9:16 自己算，所以它在任何视口
                  下都不会把按钮挤出屏幕。 */}
              {/* w-fit 让描边与底色**贴住图片**。之前容器是块级铺满，图是 h-full w-auto，
                  于是图右边露出一条容器底色——那才是上一版看着有空的真正原因，
                  而不是「图比按钮窄」。图片居中、按钮通栏本就是分享面板的标准形。 */}
              <div className="mx-auto h-[min(500px,54vh)] w-fit overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
                {poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- canvas 合成出的 objectURL，next/image 处理不了
                  <img src={poster.url} alt={t('account.invite.posterAlt')} className="h-full w-auto" />
                ) : (
                  // 合成前用底图占位：直接留空会让弹窗宽度先塌一下再弹回来。
                  // eslint-disable-next-line @next/next/no-img-element -- 同上
                  <img src={POSTER_SRC} alt={t('account.invite.posterAlt')} className="h-full w-auto opacity-40" />
                )}
              </div>

              <button
                type="button"
                onClick={savePoster}
                disabled={!poster}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2.5 text-[13px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
              >
                {poster ? <Download size={14} /> : <Loader2 size={14} className="animate-spin" />}
                {t('account.invite.savePoster')}
              </button>

              {/* 链接本身就是按钮，点它即复制。
                  此前是「复制」按钮 + 下面一行灰色 URL 小字——两个元素说同一件事，
                  而那行小字既小到不好读、又不可点，只是个说明。合成一个之后，用户
                  看到的和点到的是同一个东西，也不必先读懂「复制」再去找复制什么。
                  ghost 而非实心：海报进朋友圈是主场景，链接是给私聊和微博的补充。 */}
              <button
                type="button"
                onClick={copy}
                disabled={!inviteUrl}
                title={inviteUrl}
                className={cn(
                  'mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 transition-colors disabled:opacity-40 cursor-pointer',
                  copied
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-neutral-100'
                )}
              >
                {copied ? (
                  <>
                    <Check size={14} className="shrink-0" />
                    <span className="text-[13px]">{t('account.invite.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="shrink-0" />
                    <span className="min-w-0 truncate font-mono text-[13px]">{inviteUrl}</span>
                  </>
                )}
              </button>

              {failed && (
                <p className="mt-2 text-center text-[12px] text-rose-300">
                  {t('account.invite.posterError')}
                </p>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
