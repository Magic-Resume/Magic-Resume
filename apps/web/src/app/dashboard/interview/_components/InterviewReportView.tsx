'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy } from '@magic-resume/icons';
import type {
  InterviewDimension,
  InterviewReport,
} from '@/lib/api/interviewApi';
import type { VoiceTurn } from './useVoiceInterview';

const DIMENSIONS: InterviewDimension[] = [
  'expression',
  'depth',
  'jobFit',
  'structure',
];

/** 规范化用：空白与常见标点不算内容，「好嘞。」和「好嘞」是同一句没内容的话。 */
const PUNCTUATION = /[\s，,。.、；;：:！!？?""''（）()【】[\]—\-~·]/g;

/** 寒暄的长度上限。「我们正在面试吗」7 字仍是寒暄，一句真作答不会这么短。 */
const PLEASANTRY_MAX_CHARS = 7;

/**
 * 有实质内容的作答数。
 *
 * **判定放在前端**：两条路径上它都握有完整 transcript（实时态 `turns`、归档态
 * `archived.transcript`），为一个展示阈值加数据库列换不回等价的准确度。
 */
export function countSubstantiveAnswers(turns: readonly VoiceTurn[]): number {
  return turns.filter(
    (turn) =>
      turn.role === 'candidate' &&
      turn.text.replace(PUNCTUATION, '').length > PLEASANTRY_MAX_CHARS,
  ).length;
}

/**
 * 面试复盘。
 *
 * ## 这一页要回答的唯一问题是「下一次我该怎么答」
 *
 * 不是「我几分」。所以逐题点评是主体，分数退成坐标：一个 19 分被放大成主角时，
 * 用户读到的是一次评判；而第一次模拟面试拿 19 分本来就很正常，评判既不准确，
 * 也不是我们想说的话（同 `BAND_TONE` 那条注释的立场，只是这次文案也跟上了）。
 *
 * ## 排版上修掉的六件事（改版前都在）
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
 * 5. **贴左**：列自己不居中，于是它贴着左边缘，而球停在贴底居中——两者不在
 *    同一根轴上，宽屏下读起来像两个互不相干的东西。
 * 6. **没有出口**：读完只能按返回键。这一页是训练回路的一环，不是终点。
 *
 * ## 「没跑起来」是独立的一屏
 *
 * 候选人只留下寒暄时，0 分与五条批评对他没有信息量，只有压迫感——那不是诚实，
 * 是把一次没发生的面试当成一次失败的面试。这时只说清楚发生了什么，并给出口。
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
  answered,
  onRestart,
  onEditResume,
}: {
  report: InterviewReport;
  /** 有实质内容的作答数。0 = 这场没跑起来，整页降级成一句话加出口。 */
  answered: number;
  /** 同岗位重开。拿不到原始启动参数时不传——见 `InterviewRoom` 的 `relaunchRef`。 */
  onRestart?: () => void;
  onEditResume?: () => void;
}) {
  const { t } = useTranslation();

  if (answered === 0) {
    return (
      <Column>
        <div className="flex flex-col gap-3">
          <p className="text-[17px] font-medium leading-snug text-primary">
            {t('aiLab.interview.report.didNotStart.title')}
          </p>
          {/* 先说清楚「没分」是因为没素材，不是因为答得差。 */}
          <p className="text-mr-body-tight leading-relaxed text-secondary">
            {t('aiLab.interview.report.didNotStart.body')}
          </p>
        </div>

        <div className="rounded-xl bg-tint-sky px-3.5 py-3">
          <span className="text-mr-label font-medium text-ink-sky">
            {t('aiLab.interview.report.didNotStart.exampleLabel')}
          </span>
          <p className="mt-1 text-mr-body-tight leading-relaxed text-primary">
            {t('aiLab.interview.report.didNotStart.example')}
          </p>
        </div>

        <Actions onRestart={onRestart} onEditResume={onEditResume} />
      </Column>
    );
  }

  return (
    <Column>
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
              {/* 标签与数字贴在一起：原来用 justify-between 顶到两端，
                  容器一宽就要横跨半栏才能把「表达清晰」和「15」配上对。 */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-mr-label-tight text-secondary">
                  {t(`aiLab.interview.report.dims.${dim}`)}
                </span>
                <span className="text-mr-label-tight tabular-nums text-muted">
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
            <li key={index} className="text-mr-body-tight leading-relaxed text-primary">
              {item}
            </li>
          ))}
        </Section>
      )}

      {report.strengths.length > 0 && (
        <Section title={t('aiLab.interview.report.strengths')} quiet>
          {report.strengths.map((item, index) => (
            <li key={index} className="text-mr-caption leading-relaxed text-secondary">
              {item}
            </li>
          ))}
        </Section>
      )}

      {report.reviews.length > 0 ? (
        <section className="flex flex-col gap-6">
          <h3 className="text-mr-overline font-medium tracking-wide text-secondary">
            {t('aiLab.interview.report.reviews')}
          </h3>
          {report.reviews.map((review, index) => (
            <article key={index} className="flex flex-col gap-3">
              <div className="flex gap-3">
                {/* 前导序号而不是卡片外壳：4–8 题里定位靠它，且不多一层容器。 */}
                <span className="shrink-0 pt-0.5 text-mr-label-tight tabular-nums text-muted">
                  {index + 1}
                </span>
                <p className="text-mr-body font-medium leading-snug text-primary">
                  {review.question}
                </p>
              </div>

              <div className="flex flex-col gap-2.5 pl-[1.6rem]">
                {/* 原话：底色内嵌，不用侧边条。它是候选人自己说的，与点评必须分得开。 */}
                <div className="rounded-lg bg-sunk px-3 py-2">
                  <span className="text-mr-label text-muted">
                    {t('aiLab.interview.report.yourAnswer')}
                  </span>
                  <p className="mt-0.5 text-mr-ui leading-relaxed text-secondary">
                    {review.answerExcerpt}
                  </p>
                </div>

                {review.improvements.length > 0 && (
                  <ul className="list-disc pl-4 marker:text-muted">
                    {review.improvements.map((item, i) => (
                      <li
                        key={i}
                        className="text-mr-ui leading-relaxed text-secondary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 每一块的视觉重心。用户来这一页就是为了读它，也是唯一值得带走的东西。 */}
                {review.betterAnswer && (
                  <div className="group/better rounded-xl bg-tint-sky px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-mr-label font-medium text-ink-sky">
                        {t('aiLab.interview.report.better')}
                      </span>
                      <CopyButton text={review.betterAnswer} />
                    </div>
                    <p className="mt-1 text-mr-body-tight leading-relaxed text-primary">
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
          <p className="text-mr-caption text-secondary">
            {t('aiLab.interview.report.empty')}
          </p>
          {/* 空态要教下一步，不是只说「没有」。 */}
          <p className="text-mr-overline text-muted">
            {t('aiLab.interview.report.emptyHint')}
          </p>
        </div>
      )}

      {/*
        模型试图编造候选人发言的次数。服务端已经把这些点评剔掉了，但把它藏起来等于
        默认「捏造是可以接受的噪声」——它不是，所以要能被看见。
      */}
      {report.droppedReviews > 0 && (
        <p className="flex items-center gap-1.5 text-mr-label text-muted">
          <AlertTriangle size={12} />
          {t('aiLab.interview.report.dropped', {
            count: report.droppedReviews,
          })}
        </p>
      )}

      <Actions onRestart={onRestart} onEditResume={onEditResume} />
    </Column>
  );
}

/** 68ch：body 文字的舒适上限。列自己居中——外层只管滚动与留白。 */
function Column({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[68ch] flex-col gap-8">
      {children}
    </div>
  );
}

/**
 * 读完之后的出口。
 *
 * 不做 sticky：读完才给出口，符合「能力按需浮现，不做常驻 chrome」。
 * 「再来一场」是主动作但仍用淡染而非实心——这一页刚说完哪里不行，不该再喊一嗓子。
 */
function Actions({
  onRestart,
  onEditResume,
}: {
  onRestart?: () => void;
  onEditResume?: () => void;
}) {
  const { t } = useTranslation();
  if (!onRestart && !onEditResume) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onRestart && (
        <button
          type="button"
          onClick={onRestart}
          className="cursor-pointer rounded-full bg-tint-sky px-4 py-2 text-mr-caption font-medium text-ink-sky transition-colors hover:bg-raised"
        >
          {t('aiLab.interview.report.actions.again')}
        </button>
      )}
      {onEditResume && (
        <button
          type="button"
          onClick={onEditResume}
          className="cursor-pointer rounded-full px-4 py-2 text-mr-caption text-secondary transition-colors hover:text-primary"
        >
          {t('aiLab.interview.report.actions.editResume')}
        </button>
      )}
    </div>
  );
}

/** 次要动作：hover / 聚焦才浮现，不和「更好的答法」这个标题抢注意力。
 *  没有 hover 的设备上常驻——把它藏起来等于在触屏上删掉这个功能。 */
function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-mr-label text-ink-sky opacity-0 transition-opacity focus-visible:opacity-100 group-hover/better:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {t(
        copied
          ? 'aiLab.interview.report.actions.copied'
          : 'aiLab.interview.report.actions.copy',
      )}
    </button>
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
        className={`text-mr-overline font-medium tracking-wide ${quiet ? 'text-muted' : 'text-secondary'}`}
      >
        {title}
      </h3>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 marker:text-muted">
        {children}
      </ul>
    </section>
  );
}
