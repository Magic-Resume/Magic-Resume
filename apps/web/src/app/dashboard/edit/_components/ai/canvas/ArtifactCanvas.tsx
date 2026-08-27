'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, MapPin } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { RingGauge } from '@/components/ui/ring-gauge';
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

function scoreBandKey(score: number): string {
  if (score >= 85) return 'aiLab.artifact.scoreBand.excellent';
  if (score >= 70) return 'aiLab.artifact.scoreBand.good';
  if (score >= 50) return 'aiLab.artifact.scoreBand.medium';
  return 'aiLab.artifact.scoreBand.needsWork';
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

/** 一行「标签 + 进度条 + 数字」，人格分与分类分共用。 */
function ScoreBar({ label, value, color, index }: { label: string; value: number; color: string; index: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs text-neutral-300 w-24 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ duration: 0.7, delay: 0.15 + index * 0.1, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-medium text-white w-7 text-right tabular-nums">{Math.round(value)}</span>
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

  if (!analysis) {
    return (
      <div className="py-6 text-sm text-neutral-500">{t('aiLab.artifact.emptyAnalysis')}</div>
    );
  }

  const personas: { label: string; color: string; data: PersonaAnalysis }[] = [
    { label: t('aiLab.artifact.personas.peer'), color: PERSONA_COLORS.peer, data: analysis.peer_analysis },
    { label: t('aiLab.artifact.personas.leader'), color: PERSONA_COLORS.leader, data: analysis.leader_analysis },
    { label: t('aiLab.artifact.personas.hrbp'), color: PERSONA_COLORS.hrbp, data: analysis.hrbp_analysis },
  ];
  const strengths = topItems(personas.map((p) => p.data.strengths));
  const improvements = analysisImprovementActions(analysis, 6);
  // 三个人格各自的 suggestions 此前一条都没渲染过——它们是这份报告里最可执行的部分。
  const suggestions = topItems(personas.map((p) => p.data.suggestions), 6);
  // category_averages 同样被整份丢弃：只看总分不知道差在哪一类。
  const categories = Object.entries(analysis.category_averages ?? {});

  return (
    // 不再套卡片：右侧面板本身就是独立区域，再包一层圆角底就是容器套容器
    // （impeccable 反模式「DO NOT nest cards inside cards」）。内容直接铺在面板上，
    // 纵向节奏交给 space-y，留白交给面板自己的 p-5。
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <RingGauge value={analysis.overall_score} />
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-white">{t(scoreBandKey(analysis.overall_score))}</div>
          <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
            {t('aiLab.artifact.summary')}
          </p>
        </div>
      </div>

      <div className="space-y-3.5">
        {personas.map((p, i) => (
          <ScoreBar key={p.label} label={p.label} value={p.data.score} color={p.color} index={i} />
        ))}
      </div>

      {categories.length > 0 && (
        <ReportSection label={t('aiLab.artifact.categories')} color="#38bdf8">
          <div className="space-y-3.5">
            {categories.map(([key, value], i) => (
              <ScoreBar
                key={key}
                label={t(`aiLab.artifact.category.${key}`, { defaultValue: key })}
                value={value}
                color="#38bdf8"
                index={i}
              />
            ))}
          </div>
        </ReportSection>
      )}

      {strengths.length > 0 && (
        <ReportSection label={t('aiLab.artifact.strengths')} color="#34d399">
          {strengths.map((s) => (
            <li key={s} className="flex gap-2 text-xs text-neutral-400 leading-relaxed">
              <Check size={13} className="text-emerald-400 mt-0.5 shrink-0" />
              <span>{s}</span>
            </li>
          ))}
        </ReportSection>
      )}

      {improvements.length > 0 && (
        <ReportSection label={t('aiLab.artifact.improvements')} color="#fbbf24">
          {improvements.map((issue) => (
            <li key={issue.id}>
              {/* 每条短板都是一次改写的入口：读到问题却要自己把它重新打一遍字，
                  是这份报告此前最大的浪费。 */}
              {onFixAnalysisIssue ? (
                <button
                  type="button"
                  onClick={() => onFixAnalysisIssue(issue)}
                  className="flex w-full gap-2 rounded-lg px-1 py-0.5 text-left text-xs leading-relaxed text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-200 cursor-pointer"
                >
                  <ArrowUpRight size={13} className="text-amber-400 mt-0.5 shrink-0" />
                  <span>{issue.problem}</span>
                </button>
              ) : (
                <span className="flex gap-2 text-xs text-neutral-400 leading-relaxed">
                  <ArrowUpRight size={13} className="text-amber-400 mt-0.5 shrink-0" />
                  <span>{issue.problem}</span>
                </span>
              )}
            </li>
          ))}
        </ReportSection>
      )}

      {suggestions.length > 0 && (
        <ReportSection label={t('aiLab.artifact.suggestions')} color="#a78bfa">
          {suggestions.map((item) => (
            <li key={item} className="flex gap-2 text-xs text-neutral-400 leading-relaxed">
              <ArrowUpRight size={13} className="text-violet-400 mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ReportSection>
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
              'rounded-md border px-2 py-0.5 text-[11px] leading-tight transition-colors cursor-pointer hover:bg-amber-500/20',
              cls,
            )}
          >
            {k}
          </button>
        ) : (
          <span key={k} className={cn('rounded-md border px-2 py-0.5 text-[11px] leading-tight', cls)}>
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
          <div className="text-[15px] font-medium text-white">{t(`aiLab.artifact.match.band.${band}`)}</div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]',
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
              <pre className="text-[11px] leading-relaxed text-neutral-400 font-mono whitespace-pre-wrap bg-neutral-900/70 rounded-xl p-4">
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
