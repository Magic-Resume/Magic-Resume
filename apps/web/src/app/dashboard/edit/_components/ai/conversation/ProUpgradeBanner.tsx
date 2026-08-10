'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEntitlement } from '@/lib/extensions/billing-client';
import { useAccountUiStore } from '@/store/useAccountUiStore';
import { isCloudMode } from '@/lib/config/app';

const DISMISS_KEY = 'magic:composer-pro-banner-dismissed-at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 输入框下方的升级条。
 *
 * 只对**云端版的免费档**用户出现：开源自部署版没有付费概念，`useEntitlement()` 的
 * stub 返回 `currentPlan: null`，这里自然拿不到免费档 → 整条不渲染。这是刻意的
 * ——付费是商业构建独有的东西，OSS 仓里不该出现任何指向它的入口。
 *
 * 关掉之后隔 7 天再出现：关一次就永不再见等于放弃了这个位置，但反复弹同一条广告
 * 与「让用户有掌控感」直接冲突。7 天是两者之间那个不讨嫌的间隔。
 */
export default function ProUpgradeBanner({ retired }: { retired?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const openPricing = useAccountUiStore((s) => s.openPricing);
  const { data } = useEntitlement(isCloudMode);
  // localStorage 只能在挂载后读:服务端没有它,首帧当作「已关闭」才不会 hydration 抖。
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const at = raw ? Number(raw) : 0;
      setDismissed(Number.isFinite(at) && Date.now() - at < DISMISS_WINDOW_MS);
    } catch {
      setDismissed(false); // 隐私模式下读不到 storage,不该因此就把入口藏了
    }
  }, []);

  const plan = data?.currentPlan;
  // 免费档 = 有计划行但不要钱。`isDefault` 兜住「运营把免费档改了名」的情况。
  const isFreePlan = !!plan && (plan.priceCents === 0 || plan.isDefault);
  const eligible = isCloudMode && isFreePlan;
  // `retired`：对话一开始它就该走。欢迎态下方是空的，这条占得起；开聊之后输入框沉到
  // 底部，它就成了压在输入框下面的一条广告，而那时用户正等着回答。
  const visible = eligible && !dismissed && !retired;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 存不下就只在本次会话内生效,不值得为此打断用户。
    }
  };

  // 没资格看到它的构建（自部署 / 已付费）连壳子都不渲染。
  if (!eligible) return null;

  return (
    // 外层只管**让位**：0fr ↔ 1fr 把行高收放交给 grid 自己算，不去动 height。
    // 缺了这一层，AnimatePresence 卸载的那一帧整条高度直接消失，输入框会硬生生
    // 弹下去一截——这就是关掉横幅时那下「生硬」的来源。
    // 收放与内容的滑出同时起步、同长同曲线，读作一个动作而不是两拍。
    <div
      className="grid"
      style={{
        gridTemplateRows: visible ? '1fr' : '0fr',
        transition: reduce ? undefined : 'grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div className="overflow-hidden">
        <AnimatePresence initial={false}>
          {visible && (
            <motion.aside
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              // 往左滑走，而不是原地淡掉：它是被**这次发送**推走的，方向上要读得出
              // 「让开」而不是「消失」。入场仍是从上方落下——那是它自己出现的动作。
              exit={{ opacity: 0, x: reduce ? 0 : -32 }}
              transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
              aria-label={t('aiLab.pro.regionLabel')}
              className="relative mt-2.5 flex min-h-[60px] items-center gap-3 overflow-hidden rounded-[30px] border border-sky-400/[0.14] bg-neutral-800/60 py-3 pl-5 pr-3.5"
            >
              {/* 辉光独立成层：渐变数学留在 CSS 里，浅色态在 globals.css 统一降透明 */}
              <span aria-hidden className="composer-pro-glow absolute inset-0" />

              <p className="relative min-w-0 flex-1 text-[15px] leading-snug text-neutral-100">
                {t('aiLab.pro.title')}
                <button
                  type="button"
                  onClick={openPricing}
                  className="ml-1.5 rounded text-sky-300 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 cursor-pointer"
                >
                  {t('aiLab.pro.benefits')}
                </button>
              </p>

              <button
                type="button"
                onClick={openPricing}
                className="relative inline-flex h-8 shrink-0 items-center rounded-full border border-sky-300/30 bg-sky-400/20 px-3.5 text-[14px] text-neutral-50 transition-colors hover:bg-sky-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 cursor-pointer"
              >
                {t('aiLab.pro.cta')}
              </button>

              <button
                type="button"
                onClick={dismiss}
                aria-label={t('aiLab.pro.dismiss')}
                className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.07] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 cursor-pointer"
              >
                <X size={16} />
              </button>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
