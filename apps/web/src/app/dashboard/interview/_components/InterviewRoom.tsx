'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2 } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import {
  interviewApi,
  type InterviewReport,
  type InterviewStage,
} from '@/lib/api/interviewApi';
import { useInterviewUiStore } from '@/store/useInterviewUiStore';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import i18n from '@/i18n';
import { fromAxiosError } from '@/lib/errors/normalize';
import { appErrorMessage } from '@/lib/errors/message';
import { useVoiceInterview, type VoiceTurn } from './useVoiceInterview';
import { mergeInterviewTurns } from './mergeTurns';
import { useCaptionPacing } from './useCaptionPacing';
import CaptionSlot, { type CaptionTone } from './CaptionSlot';
import VoiceOrb from './VoiceOrb';
import type { OrbPhase } from './orbStates';
import InterviewReportView from './InterviewReportView';
import InterviewComposer from './InterviewComposer';
import Transcript from './Transcript';
import LeaveConfirm from './LeaveConfirm';

/**
 * 模拟面试的整场：**一屏、两种输入、一种回应**。
 *
 * 没有模式选择。说话和打字只是把同一句话送进去的两种方式——打字走 LiveKit 的 `lk.chat`
 * 文本流，agents 原生监听它并走同一条 TTS，所以面试官永远用同一种方式回应。用户不需要
 * 提前决定，也不该被这个决定挡在门外。
 *
 * **必须是独立路由**：一场 20 分钟的专注对话要扛得住刷新（靠 URL 里的 sessionId 恢复
 * 现场）、要有正常的后退语义、且面试中不该点得到简历。
 *
 * **一颗球贯穿全程、绝不卸载**——它是候选人唯一能读到的社交信号（真人面试靠读表情判断
 * 对方在听/在记/在想，语音把那条通道砍掉了）。技术上也必须如此：WebGPU 设备每次重建会闪。
 */

type Screen = 'restoring' | 'live' | 'report' | 'unavailable';

/** 入场准备的步骤。前三步来自服务端事件，`connecting` 是前端自己的边界。 */
type PrepStep = 'session' | 'knowledge' | 'opening' | 'connecting';

/**
 * 失败原因 → 给人看的一句话。
 *
 * 这里原来是 `err instanceof Error ? err.message : 兜底文案` —— 而绝大多数失败**都是**
 * Error，于是兜底文案几乎从不出现，用户看到的是上游的英文原文（线上实拍：一句
 * 「Connection error.」立在深色屏正中）。走仓里既有的错误文案层，它按 errorCode
 * 出中文；认不出的才落到调用方给的兜底。
 */
function describeFailure(err: unknown, fallback: string): string {
  const copy = appErrorMessage(fromAxiosError(err), i18n.t.bind(i18n));
  return copy || fallback;
}

/** 面试官说完之后，整句在底部停留多句再淡出。 */
const CAPTION_LINGER_MS = 4000;

/**
 * 等这么久还没开口就给出口。
 *
 * 这段路上有 RAG、一次完整 LLM 生成、WebRTC 建连、TTS 首包——正常几秒，但任何一环卡住
 * 都会让球一直呼吸下去。**永远转圈是最糟的失败方式**：用户不知道该等还是该走。
 */
const PREP_TIMEOUT_MS = 15_000;

export default function InterviewRoom({
  sessionId: routeId,
}: {
  sessionId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const launch = useInterviewUiStore((s) => s.launch);
  const clearLaunch = useInterviewUiStore((s) => s.clearLaunch);
  const returnTo = useInterviewUiStore((s) => s.returnTo);
  const clearReturnTo = useInterviewUiStore((s) => s.clearReturnTo);

  const [screen, setScreen] = useState<Screen>('restoring');
  const [sessionId, setSessionId] = useState<string | null>(
    routeId === 'new' ? null : routeId,
  );
  const [stage, setStage] = useState<InterviewStage>('introduction');
  // 岗位名进组件状态：`launch` 在会话建好那一刻就消费掉了，直接读它标题会在开始面试
  // 的瞬间把岗位名弄丢。恢复现场时它来自服务端。
  const [role, setRole] = useState<string | undefined>(launch?.brief.role);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lingering, setLingering] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  /**
   * 入场准备到哪一步了。**跟着服务端的真实事件走，不按固定顺序点亮**——
   * 检索面经经常被跳过，屏幕上不该出现一个没发生过的步骤。
   */
  const [prep, setPrep] = useState<PrepStep>('session');
  const [prepStalled, setPrepStalled] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  /**
   * 这一场是不是本组件自己开的。
   *
   * `begin()` 会把 URL 从 `new` replace 成真正的 sessionId，而组件不重挂——于是下面的
   * 恢复 effect 会被新的 routeId 触发，把刚建好的内存状态用一次服务端往返盖掉。
   */
  const selfStartedRef = useRef(false);

  const voice = useVoiceInterview(sessionId);
  const {
    connect: connectVoice,
    disconnect: disconnectVoice,
    readLevels,
    sendText,
    toggleMute,
  } = voice;
  const voicePhase = voice.state.phase;

  /**
   * 开场白来自 HTTP 的 `start`（落在 `turns`），之后的轮次来自 LiveKit。
   * 开场白**两边都有**——worker 会把同一段文本念出来、转写再送回来，所以要在接缝处去重。
   */
  const allTurns = mergeInterviewTurns(turns, voice.state.turns);
  const isFinished = finished || voicePhase === 'finished';

  // ── 恢复现场 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (routeId === 'new' || selfStartedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const live = await interviewApi.live(routeId);
        if (cancelled) return;
        setStage(live.stage);
        setRole(live.role);
        setTurns(
          live.messages.map((m) => ({
            role: m.role === 'assistant' ? 'interviewer' : 'candidate',
            text: m.content,
          })),
        );
        // 已经出过报告 = 这场结束了，直接进复盘，不要再连一次语音。
        if (live.hasReport) {
          setFinished(true);
          setScreen('report');
          return;
        }
        setScreen('live');
      } catch {
        // 历史报告不能依赖 1 小时 TTL 的 Redis。热态没了就读 PostgreSQL 归档；只有两边
        // 都没有时才是真正回不去。以前资产库里的「打开报告」正是卡在这层。
        try {
          const archived = await interviewApi.archived(routeId);
          if (cancelled) return;
          if (!archived.report) throw new Error('Archived report is missing');
          setStage('finished');
          setRole(archived.role);
          setTurns(
            archived.transcript.map((message) => ({
              role: message.role === 'assistant' ? 'interviewer' : 'candidate',
              text: message.content,
            })),
          );
          setReport(archived.report);
          setFinished(true);
          setScreen('report');
        } catch {
          if (!cancelled) setScreen('unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // ── 开场：进来就开，不问模式 ────────────────────────────────────────────
  const beginRef = useRef(false);
  useEffect(() => {
    if (routeId !== 'new' || beginRef.current) return;
    if (!launch) {
      setScreen('unavailable');
      return;
    }
    beginRef.current = true;
    void (async () => {
      setBusy(true);
      try {
        const result = await interviewApi.startStream(
          {
            resume_context: launch.resumeContext,
            role: launch.brief.role,
            job_description: launch.brief.jobDescription,
            // 永远按语音开：打字也经由房间送进去，所以这一场始终需要 LiveKit 凭据。
            config: {
              mode: 'voice',
              language: launch.brief.language,
              difficulty: launch.brief.difficulty,
            },
          },
          setPrep,
        );
        selfStartedRef.current = true;
        setPrep('connecting');
        setSessionId(result.session_id);
        setStage(result.stage);
        setTurns([{ role: 'interviewer', text: result.message }]);
        setScreen('live');
        startedAtRef.current = Date.now();
        appLifecycle.aiInterviewStarted();
        // URL 换成真正的 sessionId：从这里开始刷新能续上。
        router.replace(`/dashboard/interview/${result.session_id}`);
        clearLaunch();
      } catch (err) {
        setError(describeFailure(err, t('aiLab.interview.startFailed')));
        setScreen('unavailable');
      } finally {
        setBusy(false);
      }
    })();
  }, [routeId, launch, router, clearLaunch, t]);

  // 会话建好之后才连房间。
  useEffect(() => {
    if (screen === 'live' && sessionId && voicePhase === 'idle' && !isFinished) {
      void connectVoice();
    }
  }, [screen, sessionId, voicePhase, isFinished, connectVoice]);

  /**
   * 还在准备：从点进入到面试官真正开口之间。
   *
   * 判据是**面试官还没说过话**，不是某个具体阶段——中间要跨 HTTP 流、WebRTC 建连、
   * worker 领 job、TTS 首包好几段，用阶段判会在每个接缝处闪一下。
   */
  const preparing =
    routeId === 'new' &&
    screen !== 'unavailable' &&
    voicePhase !== 'speaking' &&
    voice.state.turns.length === 0;

  useEffect(() => {
    if (!preparing) {
      setPrepStalled(false);
      return;
    }
    const timer = setTimeout(() => setPrepStalled(true), PREP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [preparing]);

  // ── 送出一轮 ────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !sessionId || busy) return;
    setDraft('');
    setBusy(true);
    try {
      // 房间在就走它——面试官会把回答**说出来**，跟你开口说话完全同一条链路。
      if (await sendText(text)) {
        setTurns((prev) => [...prev, { role: 'candidate', text }]);
        return;
      }
      // 房间不在（连不上/已断开）才退回 HTTP：这时只出字，不出声。
      setTurns((prev) => [...prev, { role: 'candidate', text }]);
      const turn = await interviewApi.chat(sessionId, text);
      setTurns((prev) => [...prev, { role: 'interviewer', text: turn.message }]);
      setStage(turn.stage);
      if (turn.finished) setFinished(true);
    } catch (err) {
      setError(describeFailure(err, t('aiLab.interview.turnFailed')));
    } finally {
      setBusy(false);
    }
  }, [draft, sessionId, busy, sendText, t]);

  // ── 字幕 ────────────────────────────────────────────────────────────────
  /*
   * 静息态只有球，但面试题常带具体要求、漏一句要重问很尴尬。所以：说话时逐字流出
   * （`liveReply` 经 `useCaptionPacing` 按语速摊开），说完整句再停留 4 秒淡出。
   */
  const prevPhaseRef = useRef(voicePhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = voicePhase;
    if (prev !== 'speaking' || voicePhase === 'speaking') return;
    const last = [...turns, ...voice.state.turns]
      .reverse()
      .find((turn) => turn.role === 'interviewer');
    if (!last) return;
    setLingering(last.text);
    const timer = setTimeout(() => setLingering(null), CAPTION_LINGER_MS);
    return () => clearTimeout(timer);
    // turns 是快照，进依赖会让每一轮新对话都重置计时器。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voicePhase]);

  /**
   * 字幕槽只有一个，谁在产字就显示谁。
   *
   * 面试官说话时是它的话（正文色），你说话时是你的转写（弱化色）——后者顺便兼任
   * 「我的麦有在工作吗」。你一开口，面试官那句停留立刻让位。
   */
  // 面试官那一路要按语速摊开——框架的字幕同步器用英文分词配速，对中文失效 30 倍，
  // 不节流就整句瞬间吐完、跑到声音前面。你自己的转写不用管，ASR 本来就是逐字来的。
  const pacedReply = useCaptionPacing(
    voice.state.liveReply,
    voicePhase === 'speaking',
  );

  // 分支看 `liveReply` 而不是 `pacedReply`：面试官刚开口那一两帧配速文本还是空的，
  // 用它判断会瞬间掉回显示你自己的转写，闪一下。
  const caption = voice.state.liveReply
    ? { text: pacedReply, mine: false }
    : voice.state.liveTranscript
      ? { text: voice.state.liveTranscript, mine: true }
      : lingering
        ? { text: lingering, mine: false }
        : null;

  useEffect(() => {
    if (voice.state.liveTranscript || expanded) setLingering(null);
  }, [voice.state.liveTranscript, expanded]);

  // ── 报告 ────────────────────────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await interviewApi.report(sessionId));
    } catch (err) {
      setError(describeFailure(err, t('aiLab.interview.reportFailed')));
    } finally {
      setBusy(false);
    }
  }, [sessionId, t]);

  const finishInterview = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await interviewApi.finish(sessionId);
      setStage(result.stage);
      setFinished(result.finished);
    } catch (err) {
      setError(describeFailure(err, t('aiLab.interview.finishFailed')));
    } finally {
      setBusy(false);
    }
  }, [busy, sessionId, t]);

  useEffect(() => {
    if (!isFinished) return;
    setScreen('report');
    // 面试结束就断开房间。LiveKit 按 **agent 会话分钟** 计费（免费档 1000 分钟/月），
    // 挂着不断等于一直烧——而且报告页也不需要那条音频链路。
    disconnectVoice();
    const startedAt = startedAtRef.current;
    if (startedAt !== null) {
      startedAtRef.current = null;
      appLifecycle.aiInterviewEnded({
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      });
    }
    if (!report && !busy) void loadReport();
  }, [busy, disconnectVoice, isFinished, loadReport, report]);

  // ── 离开 ────────────────────────────────────────────────────────────────
  /*
   * 不做硬拦截：会话状态在服务端，离开只是中断这一次语音，回到同一 URL 能续。
   * 浏览器后退在 App Router 里拦不可靠——**不假装能拦**，靠「回得来」这个事实兜底。
   */
  const inProgress = screen === 'live' && !isFinished;
  /*
   * **不挂 `beforeunload`。** 浏览器那个「重新加载此网站？系统可能不会保存您所做的更改」
   * 是它自己的措辞，改不了，而且它说的不是真的：会话在服务端，刷新回到同一个 URL 就能续。
   * 拿一句错的警告去吓用户，比不拦更糟。
   */

  const leave = useCallback(() => {
    disconnectVoice();
    // 回进来时那份简历的编辑器。拿不到就退到列表——不至于把人卡在这一页。
    const destination = returnTo ?? '/dashboard';
    clearReturnTo();
    router.push(destination);
  }, [disconnectVoice, router, returnTo, clearReturnTo]);

  const onBack = useCallback(() => {
    if (inProgress) setLeaving(true);
    else leave();
  }, [inProgress, leave]);

  // ── 球 ──────────────────────────────────────────────────────────────────
  const orbPhase: OrbPhase =
    screen === 'report'
      ? 'finished'
      : screen !== 'live'
        ? 'idle'
        : busy && voicePhase === 'listening'
          ? // 打字送出后到面试官开口之间，球得有事可做，否则那几秒它看着像死了。
            'thinking'
          : voicePhase === 'speaking' ||
              voicePhase === 'thinking' ||
              voicePhase === 'listening' ||
              voicePhase === 'connecting'
            ? voicePhase
            : 'idle';

  // 出错那一屏也得让球退开：它满尺寸停在正中央，而文案也居中，两者直接叠在一起。
  const docked = expanded || screen === 'report' || screen === 'unavailable';

  const rawVoiceError = voice.state.error;
  useEffect(() => {
    if (rawVoiceError) console.warn('[interview voice]', rawVoiceError);
  }, [rawVoiceError]);
  const voiceError = rawVoiceError
    ? t(`aiLab.interview.voiceError.${voice.state.errorCode ?? 'connection'}`, {
        defaultValue: t('aiLab.interview.voiceError.connection'),
      })
    : null;

  /**
   * 槽里显示什么——**唯一的判定处**。
   *
   * 优先级：出错 > 还在准备 > 对话字幕。三路都写同一个槽，所以必须在这里定次序；
   * 否则它们会互相盖，而且展开逐字稿时字幕本该让位（那边已经有全文了）。
   */
  const slot: { text: string | null; tone: CaptionTone; shimmer?: boolean } =
    voiceError
      ? { text: voiceError, tone: 'error' }
      : preparing
        ? {
            text: t(
              prepStalled
                ? 'aiLab.interview.prep.stalled'
                : `aiLab.interview.prep.${prep}`,
            ),
            tone: 'interviewer',
            // 只有等待才有流光：它说的是「还在跑」。给已经说完的字幕加流光，
            // 会让人以为那句话还没完。
            shimmer: !prepStalled,
          }
        : !docked && caption
          ? { text: caption.text, tone: caption.mine ? 'mine' : 'interviewer' }
          : { text: null, tone: 'interviewer' };

  return (
    <div className="relative flex h-full flex-col">
      <Header
        role={role}
        stage={screen === 'live' ? stage : null}
        onBack={onBack}
      />

      <OrbStage
        docked={docked}
        phase={orbPhase}
        readLevels={readLevels}
        onToggle={screen === 'live' ? () => setExpanded((v) => !v) : undefined}
      >
        {/*
          等待、字幕、错误**共用同一个槽**，就在输入框上方。
          它们本来各占一行流内元素，谁出现谁挤压布局——球会跟着上下跳。
        */}
        {screen !== 'report' && (
          <CaptionSlot text={slot.text} tone={slot.tone} shimmer={slot.shimmer} />
        )}
        {prepStalled && preparing && (
          <div className="absolute inset-x-0 bottom-[124px] z-10 flex justify-center">
            <button
              type="button"
              onClick={leave}
              className="cursor-pointer rounded-full bg-sunk px-5 py-2 text-[12px] text-primary transition-colors hover:bg-raised"
            >
              {t('aiLab.interview.backToDashboard')}
            </button>
          </div>
        )}

        {screen === 'unavailable' && (
          <Centered>
            <p className="max-w-sm text-center text-sm leading-relaxed text-secondary">
              {error ??
                t(
                  launch
                    ? 'aiLab.interview.unavailable'
                    : 'aiLab.interview.noLaunch',
                )}
            </p>
            <button
              type="button"
              onClick={leave}
              className="cursor-pointer rounded-full bg-sunk px-5 py-2.5 text-[13px] text-primary transition-colors hover:bg-raised"
            >
              {t('aiLab.interview.backToDashboard')}
            </button>
          </Centered>
        )}

        {screen === 'live' && (
          <AnimatePresence>
            {docked && (
              <Transcript
                key="transcript"
                turns={allTurns}
                live={voice.state.liveTranscript}
                // 展开的逐字稿也用配速版：整块吐出来的话，读的人会跑到声音前面去。
                liveReply={pacedReply}
              />
            )}
          </AnimatePresence>
        )}

        {screen === 'report' && (
          <div className="absolute inset-0 overflow-y-auto px-5 pb-8 pt-2">
            {report ? (
              <InterviewReportView report={report} />
            ) : (
              <div className="flex items-center justify-center gap-2 pt-16 text-[13px] text-secondary">
                <Loader2 size={14} className="animate-spin" />
                {t('aiLab.interview.report.generating')}
              </div>
            )}
            {error && <p className="mt-4 text-[12px] text-rev-del">{error}</p>}
          </div>
        )}
      </OrbStage>

      {screen === 'live' && (
        <InterviewComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          onToggleMute={() => void toggleMute()}
          onEnd={() => void finishInterview()}
          busy={busy}
          muted={voice.state.muted}
          micDenied={voice.state.micDenied}
        />
      )}

      <LeaveConfirm
        open={leaving}
        onCancel={() => setLeaving(false)}
        onConfirm={leave}
      />
    </div>
  );
}

function Header({
  role,
  stage,
  onBack,
}: {
  role?: string;
  stage: InterviewStage | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      // 头部在球落定之后才淡入：先建立「它在这儿」，房间再围着它长出来。
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.55 }}
      className="flex shrink-0 items-center gap-3 px-5 py-3.5"
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common.back')}
        className="cursor-pointer text-secondary transition-colors hover:text-primary"
      >
        <ChevronLeft size={20} />
      </button>
      {/*
       * 标题、岗位、阶段是一组信息，必须挨在一起。用 `ml-auto` 把阶段顶到右边缘，
       * 在全屏页上它离标题两千像素远，读起来像个孤立的悬浮控件。
       */}
      <span className="text-sm font-medium text-primary">
        {t('aiLab.interview.title')}
      </span>
      {role && <span className="text-[12px] text-secondary">{role}</span>}
      {stage && (
        <span className="rounded-full bg-sunk px-2.5 py-1 text-[11px] text-secondary">
          {t(`aiLab.interview.stage.${stage}`)}
        </span>
      )}
    </motion.div>
  );
}

/**
 * 球所在的那块舞台。
 *
 * 居中交给 flex，动画只动 transform——**两者不能混**：framer-motion 写的就是
 * `transform`，跟 Tailwind 的 `-translate-x-1/2` 会互相覆盖。此前用的是
 * `-ml-[min(19vh,150px)]`，它生成 `margin-left: -min(...)`，而 `-` 不能直接前缀
 * 函数，整条声明被浏览器丢弃。
 *
 * 球的 CSS 尺寸固定、只缩放：让 `clientWidth` 在动画里逐帧变化会导致 canvas 的
 * 后备存储每帧重建一次交换链。
 */
function OrbStage({
  docked,
  phase,
  readLevels,
  onToggle,
  children,
}: {
  docked: boolean;
  phase: OrbPhase;
  readLevels: () => { input: number; output: number };
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = docked ? 0.28 : 1;
  // 收起时居中；展开时落到舞台底部，给缩小后的球留出半高与一点余白。
  const y = docked ? Math.max(0, height / 2 - 74) : 0;

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1">
      {children}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.35, opacity: 0 }}
          animate={{ scale, opacity: 1, y }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: 'min(38vh, 300px)', height: 'min(38vh, 300px)' }}
          className={onToggle ? 'pointer-events-auto cursor-pointer' : ''}
          onClick={onToggle}
          role={onToggle ? 'button' : undefined}
          aria-label={
            onToggle
              ? t(
                  docked
                    ? 'aiLab.interview.hideTranscript'
                    : 'aiLab.interview.showTranscript',
                )
              : undefined
          }
        >
          <VoiceOrb phase={phase} readLevels={readLevels} />
        </motion.div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8">
      {children}
    </div>
  );
}
