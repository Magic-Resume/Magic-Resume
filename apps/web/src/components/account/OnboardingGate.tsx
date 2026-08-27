'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { isCloudMode } from '@/lib/config/app';
import { jobProfileApi } from '@/lib/api/jobProfileApi';

/**
 * 用户**已经面对过这张问卷并做出了选择**（填完或跳过）。
 *
 * 标记由 `/onboarding` 交卷时写（`handleDone`），**不是**由这里跳转时写。差别很实在：
 * 跳转只说明我们问了，不说明他答了。写在跳转处的话，任何一次「跳过去但没走完」——
 * 浏览器后退、页面报错、他自己关掉标签——都会让这一会话再也不问，而画像仍然是空的，
 * 从外面看就是「明明没有画像却不弹引导」。
 */
const ASKED_KEY = 'magic.onboarding.asked';
/** 这一会话已经替他重试过一次合成。失败的合成大概率会连着失败，别每次进门都烧一次额度。 */
const RETRIED_KEY = 'magic.onboarding.retried';

/** 这一档活本会话是不是已经做过了（只读，不写标记）。 */
function done(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** 本次页面加载是否已经推过一次引导。刷新即清——见下面的用处。 */
let redirected = false;

function once(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key) === '1') return false;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // 隐私模式下读写不到。退化成「本次加载做一次」，仍然不会死循环——
    // `/onboarding` 不在这个组件的挂载范围内。
  }
  return true;
}

/**
 * 没有求职画像的人，进 dashboard 时送去引导。
 *
 * 三条判断写在这里，因为它们都容易被「顺手改成更积极一点」：
 *
 * 1. **只有明确的 404 才弹**。请求失败（401、网络断、服务挂了）一律什么都不做——
 *    拿不到答案就弹引导，等于每次网络抖动都把用户拽去重填一遍问卷。
 * 2. **一个会话只推一次**（`sessionStorage`）。用户在引导里点了「跳过」就会落回
 *    dashboard，那时画像仍然不存在；不记这一笔就是一个把人锁死在引导里的死循环。
 * 3. 用 `sessionStorage` 而不是 `localStorage`：跳过是「这次先不填」，不是「永远别问」。
 *    下次开浏览器再问一遍是对的。
 */
export default function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { i18n } = useTranslation();
  const locale = (i18n.language || 'zh').toLowerCase().startsWith('en')
    ? 'en'
    : 'zh';

  useEffect(() => {
    if (!isCloudMode) return;
    // 编辑器与 AI 实验室是干活的地方，半路把人拽走比晚问一次糟得多。只在工作台首页问。
    if (pathname !== '/dashboard') return;

    // 本会话的活都干完了就**别再问**。少了这一道，每次回到工作台首页（以及 dev 下
    // StrictMode 的双次挂载）都要打一次接口——日志里那串重复请求就是这么来的。
    if (done(ASKED_KEY) && done(RETRIED_KEY)) return;
    // 本次页面加载已经推过一次了。模块级变量而不是 `sessionStorage`：它只防「同一次
    // 加载里反复跳」，刷新之后该重新问——把这条也持久化，就又变成上面那个「问过就
    // 永远不问」的毛病。
    if (redirected) return;

    let cancelled = false;
    void jobProfileApi
      .get()
      .then((profile) => {
        if (cancelled) return;

        // 有答案、缺正文：上一次合成没成。**不要再把他拽回问卷**——那四步他已经填过了，
        // 缺的只是一次合成。悄悄重试，他不用知道发生过什么。
        if (profile?.status === 'pending') {
          if (once(RETRIED_KEY)) {
            void jobProfileApi.regenerate(locale).catch(() => undefined);
          }
          return;
        }
        if (profile) return;

        // 真的一份都没有，才问。
        redirected = true;
        router.replace('/onboarding');
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [pathname, router, locale]);

  return null;
}
