'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from '@magic-resume/icons';
import type {
  InterviewDimension,
  InterviewReport,
} from '@/lib/api/interviewApi';

const DIMENSIONS: InterviewDimension[] = [
  'expression',
  'depth',
  'jobFit',
  'structure',
];

/**
 * 面试复盘。
 *
 * ## 这一页要回答的唯一问题是「下一次我该怎么答」
 *
 * 不是「我几分」。所以逐题点评是主体，分数退成坐标：一个 19 分被放大成主角时，
 * 用户读到的是一次评判；而第一次模拟面试拿 19 分本来就很正常，评判既不准确，
 * 也不是我们想说的话（同 `BAND_TONE` 那条注释的立场，只是这次文案也跟上了）。
 *
 * ## 排版上修掉的四件事（改版前都在）
 *
 * 1. **行宽**：容器是 `absolute inset-0`，正文一路铺到约 1940px。13px 字号下
 *    65ch 才 ~500px，宽了近四倍，眼睛无法回行。宽度约束放在这里而不是容器上——
 *    只有内容自己知道它该多宽。
 * 2. **等宽卡片网格**：四个维度原来是 `grid-cols-4` 的同尺寸卡片，正是
 *    `.impeccable.md` anti-reference 里的「卡片堆砌」。改成一行细密的条，
 *    它们是坐标不是主角。
 * 3. **无节奏**：通篇同一个 13px + 同一个间距，三段列表长得一模一样。
 * 4. **侧边条**：原话引用用了 `border-l-2`，那是最容易被认出来的 AI 装饰。
 *    改成底色内嵌块 + 标签。
 */

/** 档位只决定语气，不决定颜色。这里不做红黄绿三色灯——把「还在打磨」染成警告色，
 *  读到的就是「你不行」。仓库里也只有 sky 一支强调色，编不出来的 token 不编。 */
const BAND_TONE: Record<InterviewReport['band'], string> = {
  ready: 'text-ink-sky',
  nearly: 'text-primary',
  developing: 'text-primary',
  early: 'text-secondary',
};

export default function InterviewReportView({
  report,
}: {
  report: InterviewReport;
}) {
  const { t } = useTranslation();

  return (
    // 68ch：body 文字的舒适上限。左对齐不居中——居中会让每一段的起点浮动。
    <div className="flex max-w-[68ch] flex-col gap-8">
      <header className="flex flex-col gap-4">
        {/* 一句话结论取代大数字。band 在这里是语气，不是评级标签。 */}
        <p
          className={`text-[17px] font-medium leading-snug ${BAND_TONE[report.band]}`}
        >
          {t(`aiLab.interview.report.verdict.${report.band}`)}
        </p>

        {/* 四维一行。没有卡片、没有边框——靠间距和一条细线承载，它们是坐标。 */}
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="flex min-w-[7.5rem] flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11.5px] text-secondary">
                  {t(`aiLab.interview.report.dims.${dim}`)}
                </span>
                <span className="text-[11.5px] tabular-nums text-muted">
                  {report.dims[dim]}
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-sunk">
                <div
                  className="h-full rounded-full bg-ink-sky/70"
                  style={{ width: `${report.dims[dim]}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* 可改进排在做得好前面：这一页的重心是「下次怎么答」，不是「你哪里还行」。 */}
      {report.improvements.length > 0 && (
        <Section title={t('aiLab.interview.report.improvements')}>
          {report.improvements.map((item, index) => (
            <li key={index} className="text-[13.5px] leading-relaxed text-primary">
              {item}
            </li>
          ))}
        </Section>
      )}

      {report.strengths.length > 0 && (
        <Section title={t('aiLab.interview.report.strengths')} quiet>
          {report.strengths.map((item, index) => (
            <li key={index} className="text-[13px] leading-relaxed text-secondary">
              {item}
            </li>
          ))}
        </Section>
      )}

      {report.reviews.length > 0 ? (
        <section className="flex flex-col gap-6">
          <h3 className="text-[12px] font-medium tracking-wide text-secondary">
            {t('aiLab.interview.report.reviews')}
          </h3>
          {report.reviews.map((review, index) => (
            <article key={index} className="flex flex-col gap-3">
              <div className="flex gap-3">
                {/* 前导序号而不是卡片外壳：4–8 题里定位靠它，且不多一层容器。 */}
                <span className="shrink-0 pt-0.5 text-[11.5px] tabular-nums text-muted">
                  {index + 1}
                </span>
                <p className="text-[14px] font-medium leading-snug text-primary">
                  {review.question}
                </p>
              </div>

              <div className="flex flex-col gap-2.5 pl-[1.6rem]">
                {/* 原话：底色内嵌，不用侧边条。它是候选人自己说的，与点评必须分得开。 */}
                <div className="rounded-lg bg-sunk px-3 py-2">
                  <span className="text-[11px] text-muted">
                    {t('aiLab.interview.report.yourAnswer')}
                  </span>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">
                    {review.answerExcerpt}
                  </p>
                </div>

                {review.improvements.length > 0 && (
                  <ul className="list-disc pl-4 marker:text-muted">
                    {review.improvements.map((item, i) => (
                      <li
                        key={i}
                        className="text-[12.5px] leading-relaxed text-secondary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 每一块的视觉重心。用户来这一页就是为了读它。 */}
                {review.betterAnswer && (
                  <div className="rounded-xl bg-tint-sky px-3.5 py-3">
                    <span className="text-[11px] font-medium text-ink-sky">
                      {t('aiLab.interview.report.better')}
                    </span>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-primary">
                      {review.betterAnswer}
                    </p>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-secondary">
            {t('aiLab.interview.report.empty')}
          </p>
          {/* 空态要教下一步，不是只说「没有」。 */}
          <p className="text-[12px] text-muted">
            {t('aiLab.interview.report.emptyHint')}
          </p>
        </div>
      )}

      {/*
        模型试图编造候选人发言的次数。服务端已经把这些点评剔掉了，但把它藏起来等于
        默认「捏造是可以接受的噪声」——它不是，所以要能被看见。
      */}
      {report.droppedReviews > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <AlertTriangle size={12} />
          {t('aiLab.interview.report.dropped', {
            count: report.droppedReviews,
          })}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  quiet = false,
  children,
}: {
  title: string;
  /** 次要段落：标题与正文都退一档，让「可改进」在同屏里更重。 */
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className={`text-[12px] font-medium tracking-wide ${quiet ? 'text-muted' : 'text-secondary'}`}
      >
        {title}
      </h3>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 marker:text-muted">
        {children}
      </ul>
    </section>
  );
}
