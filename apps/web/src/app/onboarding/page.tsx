'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { jobProfileApi } from '@/lib/api/jobProfileApi';
import OnboardingWizard from './_components/OnboardingWizard';
import type { OnboardingAnswers } from './_components/steps';

/**
 * 求职画像引导。**独立路由**，不挂在 dashboard 之下——它要占满整屏、没有侧栏，
 * 语义上也不是「工作台里的一个页面」，而是进工作台之前的一道门。
 *
 * 受 middleware 保护（`/onboarding(.*)` 已进 `isProtectedRoute`）：画像是写到这个人
 * 账号上的，匿名访客走到这儿只会填出一份没有归属的东西。
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { i18n } = useTranslation();
  /**
   * 上一次的作答。**已经有画像的人也能走到这里**（设置页的「重新回答」，或者直接敲
   * URL），那时从零开始填等于让他把上次选对的二十几项凭记忆重来一遍——真正要改的
   * 往往只有一两处。
   *
   * `undefined` = 还没问到。向导只在拿到之后预填一次，所以晚到不会覆盖他已经改的。
   * 取不到就当没有：预填是便利，不是前提，不该为它把一张问卷卡在加载态上。
   */
  const [previous, setPrevious] = useState<OnboardingAnswers | undefined>();

  useEffect(() => {
    void jobProfileApi
      .get()
      .then((profile) => {
        if (profile?.answers && Object.keys(profile.answers).length) {
          setPrevious(profile.answers);
        }
      })
      .catch(() => undefined);
  }, []);

  /**
   * 交卷即走，**不等模型**。
   *
   * 合成画像是几秒到十几秒的事，把用户按在一个转圈的屏幕前等它，等于用一段他没要的
   * 等待去换一个他还看不见的收益——而这一步的意义本来就是「快点让他进去用」。
   *
   * 所以生成是**发出去就不管**。跳到 `/dashboard` 是客户端软导航，文档不卸载，
   * 这个 XHR 会照常跑完（真正会掐断请求的是整页卸载，那种情况才需要 `keepalive`）。
   * 失败也不拦人——画像没生成成的代价是 AI 少知道一点，不是流程走不下去；下次进来
   * 发现没有画像会再问一次。
   */
  const handleDone = (answers: OnboardingAnswers) => {
    // 记一笔「他已经面对过这张问卷并做出了选择」。**这里写而不是在 gate 跳转时写**：
    // 跳过之后会落回 `/dashboard`，那时画像仍然是空的，不先记一笔就是个把人锁死在
    // 引导里的死循环；而写在跳转处又会让「跳过去但没走完」也算数。
    try {
      window.sessionStorage.setItem('magic.onboarding.asked', '1');
    } catch {
      // 隐私模式下写不进去。退化成「本次加载问一次」，仍然不会死循环——
      // gate 里那个模块级 `redirected` 兜着。
    }

    // 空对象 = 整张被跳过。**不要**为跳过的人生成画像——那只会编出一份他没说过的东西。
    // （服务端同样拒绝空答案，这里挡一道只是省掉一次必然失败的往返。）
    if (Object.keys(answers).length > 0) {
      const locale = (i18n.language || 'zh').toLowerCase().startsWith('en')
        ? 'en'
        : 'zh';
      void jobProfileApi.generate(answers, locale).catch(() => undefined);
    }
    router.replace('/dashboard');
  };

  return (
    <OnboardingWizard open initialAnswers={previous} onDone={handleDone} />
  );
}
