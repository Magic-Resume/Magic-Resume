'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Check, MapPin } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { RingGauge } from '@/components/ui/ring-gauge';
import { ScoreRadar } from '@/components/ui/score-radar';
import { cn } from '@/lib/utils';
import { Resume } from '@/types/frontend/resume';
import ResumePreview from '../../preview/ResumePreview';
import { SKILLS } from '../skills/registry';
import type { CanvasState } from '../types';
import type {
  AnalysisImprovementAction,
  MultiPersonaResumeAnalysis,
  PersonaAnalysis,
} from '@/types/agent/multi-persona';
import type { FitDimension, FitReport } from '@/types/agent/fit-report';
import { analysisImprovementActions } from '../lib/analysisIssues';

type ArtifactCanvasProps = {
  state: CanvasState;
  resumeData: Resume;
  templateId: string;
  analysis: MultiPersonaResumeAnalysis | null;
  fitReport: FitReport | null;
  onDiscard: () => void;
  /**
   * 把报告里的一条结论变成下一步动作。报告本身不是终点：`missing_keywords` 和
   * weaknesses 正是优化的输入，此前它们只能看,用户得自己把结论重新打一遍字。
   */
  onFollowUp?: (text: string) => void;
  /** Typed remediation keeps report provenance and verified resume locations intact. */
  onFixAnalysisIssue?: (issue: AnalysisImprovementAction) => void;
};

const PERSONA_COLORS = { peer: '#38bdf8', leader: '#a78bfa', hrbp: '#34d399' };

/** Fixed order + accent per fit dimension (design: sky-led workstation palette). */
const FIT_DIMENSIONS: { key: FitDimension; color: string }[] = [
  { key: 'technical', color: '#38bdf8' },
  { key: 'experience', color: '#a78bfa' },
  { key: 'behavioral', color: '#34d399' },
  { key: 'career', color: '#fbbf24' },
];

/** Flatten + de-dupe persona bullet lists, capping the count for the compact view. */
function topItems(lists: string[][], cap = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list || []) {
      const t = item.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

type ScoreBand = 'outstanding' | 'strong' | 'solid' | 'rough' | 'draft';

/** 分档只判一次，档位词、整句和兜底评语都由它派生——省得三处各判各的、在边界上打架。 */
function scoreBand(score: number): ScoreBand {
  if (score >= 90) return 'outstanding';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'solid';
  if (score >= 45) return 'rough';
  return 'draft';
}

function scoreBandKey(score: number): string {
  return `aiLab.artifact.scoreBand.${scoreBand(score)}`;
}

function ReportSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-3.5 rounded-full" style={{ background: color }} />
        <span className="text-xs font-medium text-neutral-200">{label}</span>
      </div>
      <ul className="space-y-2 pl-0.5">{children}</ul>
    </div>
  );
}

/**
 * 雷达的轴序固定在这里，不跟 `category_averages` 的键序走：轴的顺序是版面，不该由
 * 上游对象的插入顺序决定。缺的维度直接不成轴（雷达对轴数不敏感）。
 */
const CATEGORY_ORDER = [
  'ImpactAndActionability',
  'QuantifiableAchievements',
  'ClarityAndReadability',
  'AiCollaboration',
  'CredibilityAndSpecificity',
] as const;

const PERSONA_SLOTS = [
  { key: 'peer', color: PERSONA_COLORS.peer, field: 'peer_analysis' },
  { key: 'leader', color: PERSONA_COLORS.leader, field: 'leader_analysis' },
  { key: 'hrbp', color: PERSONA_COLORS.hrbp, field: 'hrbp_analysis' },
] as const;

/** 只读的佐证列表。密度刻意高于上面的行动区——它是用来扫的，不是用来点的。 */
function EvidenceList({
  label,
  items,
  icon: Icon,
  tone,
}: {
  label: string;
  items: string[];
  icon: typeof Check;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-2 text-mr-label text-mr-ink-secondary">{label}</div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5 text-mr-label-tight leading-relaxed text-mr-muted">
            <Icon size={12} className={cn('mt-0.5 shrink-0', tone)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreView({
  analysis,
  onFixAnalysisIssue,
}: {
  analysis: MultiPersonaResumeAnalysis | null;
  onFixAnalysisIssue?: (issue: AnalysisImprovementAction) => void;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [activeAxis, setActiveAxis] = React.useState<string | null>(null);

  if (!analysis) {
    return (
      <div className="py-6 text-mr-body text-mr-muted">{t('aiLab.artifact.emptyAnalysis')}</div>
    );
  }

  const categoryName = (key: string) =>
    t(`aiLab.artifact.category.${key}`, { defaultValue: key });
  const axes = CATEGORY_ORDER.filter(
    (key) => typeof analysis.category_averages?.[key] === 'number',
  ).map((key) => ({
    key,
    label: t(`aiLab.artifact.categoryShort.${key}`, { defaultValue: categoryName(key) }),
    title: categoryName(key),
    value: analysis.category_averages[key],
  }));

  const band = scoreBand(analysis.overall_score);
  // 兜底文案按分数取，不用随机数：渐进快照会让这里重渲染好几次，随机会让评语一直跳。
  const verdict =
    analysis.verdict?.trim() ||
    t(`aiLab.artifact.verdictFallback.${band}_${analysis.overall_score % 2}`);

  const personas = PERSONA_SLOTS.map((slot) => ({
    ...slot,
    label: t(`aiLab.artifact.personas.${slot.key}`),
    data: analysis[slot.field] as PersonaAnalysis | undefined,
  }));
  const strengths = topItems(personas.map((p) => p.data?.strengths ?? []));
  const improvements = analysisImprovementActions(analysis, 6);
  const suggestions = topItems(personas.map((p) => p.data?.suggestions ?? []), 6);

  return (
    // 不套卡片：右侧面板本身就是独立区域，再包一层圆角底就是容器套容器
    // （impeccable 反模式「DO NOT nest cards inside cards」）。
    <div className="space-y-7">
      {/* 判断区：一张图吃掉总分和五维形状，7 条进度条降成 1 图 + 1 行。 */}
      <section className="space-y-3">
        {axes.length >= 3 ? (
          <ScoreRadar
            axes={axes}
            centerValue={analysis.overall_score}
            centerCaption={t(`aiLab.artifact.scoreBandShort.${band}`)}
            centerCaptionAccent={band === 'outstanding'}
            activeKey={activeAxis}
            onActiveChange={setActiveAxis}
            ariaLabel={t('aiLab.artifact.radarLabel')}
          />
        ) : (
          <div className="flex items-center gap-5">
            <RingGauge value={analysis.overall_score} />
            <div className="text-mr-subtitle font-medium text-mr-ink">
              {t(scoreBandKey(analysis.overall_score))}
            </div>
          </div>
        )}

        {/* 同一行两个职责：静息给三人总分，聚焦某条轴时原地换成该维度上的三人分歧。 */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          {personas.map((p) => {
            const status = p.data?.status ?? 'ok';
            const value = activeAxis
              ? p.data?.categories_scores?.[activeAxis]
              : p.data?.score;
            return (
              <span key={p.key} className="flex items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="text-mr-micro text-mr-muted">{p.label}</span>
                {status === 'ok' ? (
                  <span className="text-mr-caption font-medium tabular-nums text-mr-ink">
                    {Math.round(value ?? 0)}
                  </span>
                ) : (
                  // 没有结论就说没有结论。0 分和「这轮没跑出来」不是一回事。
                  <span className="text-mr-micro text-mr-muted">
                    {t(
                      status === 'pending'
                        ? 'aiLab.artifact.personaPending'
                        : 'aiLab.artifact.personaFailed',
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* 静息是这份简历的评语，悬停某轴时让位给三方分歧。锁最小高度，切换不抖版。
            评语晚于分数到达，所以只有它做淡入；悬停切换是即时的，否则划过五个角会一直闪。 */}
        <div className="flex min-h-8 items-start justify-center px-2">
          {activeAxis ? (
            <p className="text-center text-mr-micro text-mr-muted">
              {t('aiLab.artifact.axisBreakdown', { axis: categoryName(activeAxis) })}
            </p>
          ) : (
            <motion.p
              key={verdict}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-[38ch] text-center text-mr-caption leading-relaxed text-mr-ink-secondary"
            >
              {verdict}
            </motion.p>
          )}
        </div>
      </section>

      {/* 行动区：整份报告唯一的出口，提到第二位，且必须看得出来能点。 */}
      {improvements.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-mr-body-medium text-mr-ink">{t('aiLab.artifact.improvements')}</h3>
            {onFixAnalysisIssue && (
              <span className="text-mr-micro text-mr-muted">{t('aiLab.artifact.improvementsHint')}</span>
            )}
          </div>
          <ul className="space-y-0.5">
            {improvements.map((issue) => (
              <li key={issue.id}>
                {/* 每条短板都是一次改写的入口：读到问题却要自己再打一遍字，
                    是这份报告此前最大的浪费。 */}
                {onFixAnalysisIssue ? (
                  <button
                    type="button"
                    onClick={() => onFixAnalysisIssue(issue)}
                    className="group flex w-full cursor-pointer items-start gap-2.5 rounded-mr-control border border-transparent px-2 py-2 text-left transition-colors hover:border-mr-line hover:bg-mr-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mr-focus"
                  >
                    <ArrowUpRight
                      size={14}
                      className="mt-0.5 shrink-0 text-mr-accent transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                    <span className="text-mr-caption leading-relaxed text-mr-ink-secondary transition-colors group-hover:text-mr-ink">
                      {issue.problem}
                    </span>
                  </button>
                ) : (
                  <span className="flex gap-2.5 px-2 py-2 text-mr-caption leading-relaxed text-mr-ink-secondary">
                    <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-mr-muted" />
                    <span>{issue.problem}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 佐证区：只读、密度更高，宽的时候并排——和上面的行动区拉开差别。 */}
      {(strengths.length > 0 || suggestions.length > 0) && (
        <section className="@container">
          <div className="grid gap-x-6 gap-y-5 @md:grid-cols-2">
            {strengths.length > 0 && (
              <EvidenceList
                label={t('aiLab.artifact.strengths')}
                items={strengths}
                icon={Check}
                tone="text-emerald-400"
              />
            )}
            {suggestions.length > 0 && (
              <EvidenceList
                label={t('aiLab.artifact.suggestions')}
                items={suggestions}
                icon={ArrowUpRight}
                tone="text-violet-400"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Keyword pills. Missing ones are buttons: a keyword the JD wants and the resume
 * lacks is the most actionable thing on this whole report, and leaving it as
 * static text means the user has to retype the conclusion to act on it.
 */
function KeywordChips({
  items,
  tone,
  onPick,
}: {
  items: string[];
  tone: 'matched' | 'missing';
  onPick?: (keyword: string) => void;
}) {
  const { t } = useTranslation();
  const cls =
    tone === 'matched'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) =>
        onPick ? (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            title={t('aiLab.artifact.match.useKeyword', { keyword: k })}
            className={cn(
              'rounded-md border px-2 py-0.5 text-mr-label leading-tight transition-colors cursor-pointer hover:bg-amber-500/20',
              cls,
            )}
          >
            {k}
          </button>
        ) : (
          <span key={k} className={cn('rounded-md border px-2 py-0.5 text-mr-label leading-tight', cls)}>
            {k}
          </span>
        ),
      )}
    </div>
  );
}

function MatchView({
  fitReport,
  onFollowUp,
}: {
  fitReport: FitReport | null;
  onFollowUp?: (text: string) => void;
}) {
  const { t } = useTranslation();

  if (!fitReport) {
    return (
      <div className="py-6 text-sm text-neutral-500">{t('aiLab.artifact.match.empty')}</div>
    );
  }

  const { overall, band, location_pass, dims, matched_keywords, missing_keywords, gaps } = fitReport;

  return (
    // 不再套卡片：右侧面板本身就是独立区域，再包一层圆角底就是容器套容器
    // （impeccable 反模式「DO NOT nest cards inside cards」）。内容直接铺在面板上，
    // 纵向节奏交给 space-y，留白交给面板自己的 p-5。
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <RingGauge value={overall} />
        <div className="min-w-0 space-y-1.5">
          <div className="text-mr-subtitle font-medium text-white">{t(`aiLab.artifact.match.band.${band}`)}</div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-mr-label',
              location_pass
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
            )}
          >
            <MapPin size={11} />
            {t(location_pass ? 'aiLab.artifact.match.locationPass' : 'aiLab.artifact.match.locationFail')}
          </span>
        </div>
      </div>

      <div className="space-y-3.5">
        {FIT_DIMENSIONS.map((d, i) => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-neutral-300 w-16 shrink-0">{t(`aiLab.artifact.match.dims.${d.key}`)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: d.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, dims[d.key] ?? 0))}%` }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs font-medium text-white w-7 text-right tabular-nums">
              {Math.round(dims[d.key] ?? 0)}
            </span>
          </div>
        ))}
      </div>

      {matched_keywords.length > 0 && (
        <ReportSection label={t('aiLab.artifact.match.matched')} color="#34d399">
          <KeywordChips items={matched_keywords} tone="matched" />
        </ReportSection>
      )}

      {missing_keywords.length > 0 && (
        <ReportSection label={t('aiLab.artifact.match.missing')} color="#fbbf24">
          <KeywordChips
            items={missing_keywords}
            tone="missing"
            onPick={
              onFollowUp
                ? (k) => onFollowUp(t('aiLab.artifact.match.useKeywordPrompt', { keyword: k }))
                : undefined
            }
          />
        </ReportSection>
      )}

      {gaps.length > 0 && (
        <ReportSection label={t('aiLab.artifact.match.gaps')} color="#38bdf8">
          {gaps.map((g) => (
            <li key={g} className="flex gap-2 text-xs text-neutral-400 leading-relaxed">
              <ArrowUpRight size={13} className="text-sky-400 mt-0.5 shrink-0" />
              <span>{g}</span>
            </li>
          ))}
        </ReportSection>
      )}

      {onFollowUp && (missing_keywords.length > 0 || gaps.length > 0) && (
        <button
          type="button"
          onClick={() => onFollowUp(t('aiLab.artifact.match.closeGapsPrompt'))}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500/15 text-sm text-sky-300 transition-colors hover:bg-sky-500/25 cursor-pointer"
        >
          <ArrowUpRight size={14} />
          {t('aiLab.artifact.match.closeGaps')}
        </button>
      )}
    </div>
  );
}

function ArtifactCanvas({
  state,
  resumeData,
  templateId,
  analysis,
  fitReport,
  onDiscard,
  onFollowUp,
  onFixAnalysisIssue,
}: ArtifactCanvasProps) {
  const { t } = useTranslation();
  const { open, skillId, view } = state;
  const skill = skillId ? SKILLS[skillId] : null;

  return (
    <div
      // 宽度不再由自己动：右舞台是**一块**地方，宽度统一由 AiChatShell 那一层动一次。
      // 这里自己再动一遍就会和父层的动画叠加，切换时中间的对话列被挤到 0 再弹回来。
      className={cn('flex h-full w-full flex-col overflow-hidden', open && 'bg-neutral-900/25')}
    >
      {open && skill && (
        <>
          <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto p-5">
            {view === 'preview' && (
              <div className="bg-white/95 rounded-lg p-2 flex justify-center overflow-hidden">
                <div style={{ transform: 'scale(0.5)', transformOrigin: 'top center', minWidth: '600px' }}>
                  <ResumePreview
                    info={resumeData.info}
                    sections={resumeData.sections}
                    sectionOrder={resumeData.sectionOrder.map((s) => s.key)}
                    templateId={templateId}
                  />
                </div>
              </div>
            )}

            {view === 'json' && (
              <pre className="text-mr-label leading-relaxed text-neutral-400 font-mono whitespace-pre-wrap bg-neutral-900/70 rounded-xl p-4">
                {JSON.stringify({ info: resumeData.info, sections: resumeData.sections }, null, 2)}
              </pre>
            )}

            {view === 'score' && (
              <div className="mx-auto w-full max-w-2xl">
                <ScoreView analysis={analysis} onFixAnalysisIssue={onFixAnalysisIssue} />
              </div>
            )}

            {view === 'match' && (
              <div className="mx-auto w-full max-w-2xl">
                <MatchView fitReport={fitReport} onFollowUp={onFollowUp} />
              </div>
            )}
          </div>

          {/* 这里原来有一条「N 处改动待评审 / 放弃 / 应用更改」页脚。它是 LivingCanvas
              出现之前的遗留：计数写死成 4，「应用更改」把 resumeData.sections 原样再
              set 一遍（空操作）后回一句「已把 4 处改动应用到当前简历」。真正的改动评审
              早已在 LivingCanvas 上就地进行，留着只会骗人，故删除。 */}
          {view !== 'score' && view !== 'match' && (
            <div className="px-5 py-3 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onDiscard}
                className="ml-auto text-xs px-3.5 py-1.5 rounded-lg text-neutral-400 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                {t('aiLab.artifact.close')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default React.memo(ArtifactCanvas);
