'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from '@magic-resume/icons';
import { BrandMark } from '@/app/dashboard/_components/BrandMark';
import ChipGroup from './ChipGroup';
import { ONBOARDING_STEPS, type OnboardingAnswers } from './steps';

/**
 * 求职画像向导。
 *
 * **居中卡片，不是摊开的整屏。** 上一版把进度点丢在左上角、标题居中偏上、chips 铺到
 * 屏幕两端、按钮沉到右下——四组元素分居四方，眼睛无处落脚。同样的黑底，收进一块卡片
 * 之后空场才从「空洞」变成「留白」。
 *
 * 角色是主角不是贴图：`public/marks/` 里六种姿态的 Polaris 随步骤换神情（坐着听 →
 * 歪头想 → 记下来 → 懂了），把「填表」变成「有个小家伙在听你说」。
 *
 * 动效只用 transform / opacity，靠**编排**造质感；`prefers-reduced-motion` 一律降为
 * 纯淡入。
 */

const EASE = [0.22, 0.61, 0.25, 1] as const;
/** 收尾那一拍的时长。 */
const DONE_MS = 1500;
const CARD_W = 760;

export interface OnboardingWizardProps {
  open: boolean;
  /**
   * 上一次的作答，用于**重走引导时预填**。存的是文案（见 `JobProfile.answers`），
   * 这里反查回选项 slug 才能让 chips 选中。
   */
  initialAnswers?: OnboardingAnswers;
  /** 完成或跳过都会调；`answers` 为空表示整张被跳过。 */
  onDone: (answers: OnboardingAnswers) => void;
}

export default function OnboardingWizard({
  open,
  initialAnswers,
  onDone,
}: OnboardingWizardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [note, setNote] = useState('');
  /** 预填只做一次：之后每一次改动都是用户自己的，不该被异步到货的旧答案盖掉。 */
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || !initialAnswers) return;
    hydrated.current = true;
    const restored: OnboardingAnswers = {};
    for (const step of ONBOARDING_STEPS) {
      for (const field of step.fields) {
        const stored = initialAnswers[field.id];
        if (!stored?.length) continue;
        // 反查：文案 → slug。查不到就**原样留着当自定义项**——它要么本来就是用户
        // 自己填的，要么是他上次用另一种语言选的。两种情况下丢掉都比留着糟。
        const bySlug = new Map(
          field.options.map((option) => [
            t(`onboarding.fields.${field.id}.options.${option}`),
            option,
          ]),
        );
        restored[field.id] = stored.map((label) => bySlug.get(label) ?? label);
      }
    }
    setAnswers(restored);
    if (initialAnswers.note?.length) setNote(initialAnswers.note[0]);
  }, [initialAnswers, t]);

  const step = ONBOARDING_STEPS[index];
  const last = index === ONBOARDING_STEPS.length - 1;
  /**
   * 交卷后停一拍再走。
   *
   * **不是等模型**——画像仍然是发出去就不管。这一拍是给「我说完了」一个回执：填了四步
   * 之后画面瞬间变成工作台，人会怀疑刚才那下到底点上没有。一个收尾的动作把问卷合上，
   * 比一次无声的跳转诚实。
   *
   * 「跳过」不走这一拍：什么都没发生，庆祝什么。
   */
  const [done, setDone] = useState(false);

  const go = useCallback((delta: 1 | -1) => {
    setDirection(delta);
    setIndex((current) =>
      Math.min(ONBOARDING_STEPS.length - 1, Math.max(0, current + delta)),
    );
  }, []);

  /**
   * 交卷时把选项 **slug 换成文案**再交出去。
   *
   * 存进画像的是「前端」而不是 `frontend`：后者对合成画像的模型是个需要猜的标识符，
   * 前者才是用户实际看到并选下的那个词。自定义项本来就只有文案，混着两种形态更糟。
   *
   * 没选的字段**不留键**——不要写一句「未知」进去，那会被当成事实合进画像。
   */
  const finish = useCallback(() => {
    const collected: OnboardingAnswers = {};
    for (const step of ONBOARDING_STEPS) {
      for (const field of step.fields) {
        const picked = answers[field.id];
        if (!picked?.length) continue;
        collected[field.id] = picked.map((value) =>
          field.options.includes(value)
            ? t(`onboarding.fields.${field.id}.options.${value}`)
            : value,
        );
      }
    }
    if (note.trim()) collected.note = [note.trim()];
    setDone(true);
    // 够读完一行短句，又短到不像在等什么。
    window.setTimeout(() => onDone(collected), DONE_MS);
  }, [answers, note, onDone, t]);

  const bodyMotion = useMemo(
    () =>
      reduceMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            transition: { duration: 0.16 },
          }
        : {
            initial: { opacity: 0, y: 12 * direction },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -12 * direction },
            // 出去的先走、进来的晚 60ms：两段不重叠才读得出「换了一页」而不是「闪了一下」。
            transition: { duration: 0.3, ease: EASE, delay: 0.06 },
          },
    [direction, reduceMotion],
  );

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="fixed inset-0 z-[120] bg-desk"
          />
        </Dialog.Overlay>
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          // 整屏**不滚**。要滚的是卡片的正文区（下面那个 `min-h-0 flex-1 overflow-y-auto`），
          // 横幅和底栏钉住不动——否则第一步这种选项多的卡会把整页撑出滚动条，「下一步」被
          // 推到屏幕外面，得先滚一段才够得着那颗按钮。
          className="fixed inset-0 z-[121] flex flex-col items-center overflow-hidden outline-none"
        >
          <Dialog.Title className="sr-only">{t('onboarding.title')}</Dialog.Title>

          <div className="flex w-full shrink-0 items-center px-6 py-5 sm:px-8">
            <BrandMark size={26} />
          </div>

          {/* `min-h-0`：flex 子项默认 `min-height:auto`，不显式压掉的话内容再高也不肯收缩，
              内部滚动就永远不会触发，溢出照旧顶到外层。 */}
          <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center px-4 pb-6">
            <motion.div
              // `layout`：每一步的选项数量不同，卡片高度必须**跟着缓动**而不是硬跳。
              // 少了它，换步那一拍是「塌下去再撑开」——比不动画还难看。
              layout={!reduceMotion}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.45,
                ease: EASE,
                layout: { duration: 0.38, ease: EASE },
              }}
              style={{ maxWidth: CARD_W }}
              className="flex max-h-full w-full flex-col overflow-hidden rounded-[16px] bg-surface shadow-card ring-1 ring-inset ring-line"
            >
              {/* ── 角色横幅 ───────────────────────────────── */}
              {/* `max-h-[22vh]`：矮屏上先让横幅让位。角色是绝对定位吸在底边的，压缩这一块
                  只是裁掉一点辉光，而换来的是正文少滚一屏。 */}
              <div className="relative h-[168px] max-h-[22vh] min-h-[104px] shrink-0 overflow-hidden">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(120% 100% at 50% 118%, color-mix(in oklab, ${step.glow} 34%, transparent) 0%, transparent 68%)`,
                    }}
                  />
                </AnimatePresence>
                {/* 底部一道 hairline 把横幅和正文分开，不用整块底色——少 border 是这套语言的基调。 */}
                <span className="absolute inset-x-0 bottom-0 h-px bg-line" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img
                    key={done ? 'done' : step.pose}
                    src={`/marks/${done ? 'polaris-pet-jump' : step.pose}.svg`}
                    alt=""
                    aria-hidden
                    width={96}
                    height={96}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.36, ease: EASE }}
                    className="absolute bottom-5 left-1/2 size-24 -translate-x-1/2"
                  />
                </AnimatePresence>
              </div>

              {/* ── 正文 ──────────────────────────────────── */}
              {/* `popLayout` 而不是 `wait`：`wait` 会先把旧内容卸载、等它走完再挂新的，
                  中间那一拍容器高度是塌的，看起来就是硬切。`popLayout` 让退出的元素
                  脱离布局流，容器立刻按新内容量高度，再由上面的 `layout` 补成缓动。 */}
              {/* `flex-auto`（`1 1 auto`）而不是 `flex-1`（`1 1 0%`）：卡片自身是 auto 高，
                  basis 0 会让它按 0 参与父级高度计算，正文直接塌成一条。basis auto 则先按
                  内容量撑开，撞上 `max-h-full` 再连同 `min-h-0` 一起收缩、交给这里滚。 */}
              <div className="relative min-h-0 flex-auto overflow-y-auto overscroll-contain px-7 pb-6 pt-7 sm:px-9">
                <AnimatePresence mode="popLayout" initial={false}>
                  {done ? (
                    <motion.div
                      key="done"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.34, ease: EASE }}
                      className="py-6 text-center"
                    >
                      <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
                        {t('onboarding.done.title')}
                      </h2>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
                        {t('onboarding.done.subtitle')}
                      </p>
                    </motion.div>
                  ) : (
                  <motion.div key={step.id} {...bodyMotion}>
                    {/* 只留标题。四句副标题说的都是标题已经说过的事（「先说个大方向」之于
                        「你在找什么工作?」），读它的成本大于它带来的信息。 */}
                    <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
                      {t(`onboarding.steps.${step.id}.title`)}
                    </h2>

                    <div className="mt-7 space-y-6">
                      {step.fields.map((field) => (
                        <div key={field.id}>
                          <p className="mb-2.5 text-[12.5px] font-medium text-ink-2">
                            {t(`onboarding.fields.${field.id}.label`)}
                          </p>
                          <ChipGroup
                            kind={field.kind}
                            layoutId={`onboarding-${field.id}`}
                            ariaLabel={t(`onboarding.fields.${field.id}.label`)}
                            allowCustom={field.allowCustom}
                            options={field.options.map((option) => ({
                              value: option,
                              label: t(`onboarding.fields.${field.id}.options.${option}`),
                            }))}
                            value={answers[field.id] ?? []}
                            onChange={(next) =>
                              setAnswers((current) => ({ ...current, [field.id]: next }))
                            }
                          />
                        </div>
                      ))}

                      {step.freeText && (
                        <div>
                          <p className="mb-2.5 text-[12.5px] font-medium text-ink-2">
                            {t('onboarding.fields.note.label')}
                          </p>
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            placeholder={t('onboarding.fields.note.placeholder')}
                            className="w-full resize-none rounded-[10px] bg-field px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none ring-1 ring-inset ring-line transition-[box-shadow] placeholder:text-ink-3 focus:ring-accent"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── 底栏：退出 · 进度 · 继续 ────────────────── */}
              {/* 收尾那一拍里没有任何可做的事，底栏整条收起来——留着三个点不亮的进度和
                  一颗按不动的按钮，只会让人以为还要再点一下。 */}
              {!done && (
              <div className="flex shrink-0 items-center gap-4 border-t border-line px-7 py-4 sm:px-9">
                {/* 「跳过」收进卡内左下角。吊在卡片外面时它读起来像页面级的逃生门，
                    而它其实只是这张卡的一个选项；卡下那块空地也让整张卡显得没落地。
                    左下角是「退出」的常规位置，与右下角的主行动分处两端，不会误点。 */}
                <div className="flex items-center gap-3">
                  {index > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => go(-1)}
                        className="flex items-center gap-1 rounded-full py-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
                      >
                        <ArrowLeft size={13} />
                        {t('onboarding.previous')}
                      </button>
                      {/* 一道竖线：两个都是低强调的文字按钮，挨着放会读成一句话。 */}
                      <span aria-hidden className="h-3 w-px bg-line-strong" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onDone({})}
                    className="rounded-full py-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
                  >
                    {t('onboarding.skip')}
                  </button>
                </div>

                {/* 进度紧挨着「继续」：它描述的是这颗按钮还要按几次，放在屏幕另一角就失去了指涉。 */}
                <div className="ml-auto flex items-center gap-1.5" aria-hidden>
                  {ONBOARDING_STEPS.map((entry, i) => (
                    <React.Fragment key={entry.id}>
                      {i > 0 && (
                        <span className="relative h-px w-4 overflow-hidden bg-line-strong">
                          <motion.span
                            className="absolute inset-0 origin-left bg-accent"
                            initial={false}
                            animate={{ scaleX: i <= index ? 1 : 0 }}
                            transition={{ duration: 0.34, ease: EASE }}
                          />
                        </span>
                      )}
                      <motion.span
                        className="size-1.5 rounded-full"
                        initial={false}
                        animate={{
                          backgroundColor: i <= index ? 'var(--accent)' : 'var(--line-strong)',
                          scale: i === index ? 1.5 : 1,
                        }}
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    </React.Fragment>
                  ))}
                </div>

                {/* 未答也可点——点了就是跳过这一步。灰掉会让人以为卡住了，而这本来就能跳过。
                    底色走 `--ink` / `--canvas` 这对反相令牌而不是写死的 `#fff` / `#0a0a0a`：
                    深色下仍是那颗白药丸，浅色下自动翻成暖炭底浅字——写死的白在浅色主题里
                    是白纸上贴白纸，按钮整个消失。 */}
                <button
                  type="button"
                  onClick={() => (last ? finish() : go(1))}
                  className="rounded-full bg-[color:var(--ink)] px-5 py-2 text-[13px] font-medium text-[color:var(--canvas)] transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
                >
                  {t(last ? 'onboarding.finish' : 'onboarding.next')}
                </button>
              </div>
              )}
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
