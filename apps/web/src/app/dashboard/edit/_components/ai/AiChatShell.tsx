'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, SquarePen, X, PencilRuler, Check, KeyRound, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { InfoType, Resume, Section } from '@/types/frontend/resume';
import { SKILLS } from './skills/registry';
import { GenUIProvider } from '@magic-resume/genui';
import { WIDGETS, askChoiceKind } from './widgets/registry';
import { AI_WIDGET_SOURCES } from './widgets/sources';
import type { WidgetActionResult, WidgetEnvelope, WidgetKind } from '@magic-resume/genui/contract';
import type { CanvasState, ChatMessage, PlanTodo, SkillId } from './types';
import ChatThread from './conversation/ChatThread';
import Composer from './conversation/Composer';
import PolarisPerch from './conversation/PolarisPerch';
import { setFlightOrigin } from './conversation/polarisFlight';
import { AGENT_MODES, type AgentMode } from './conversation/modes';
import { activityForTool, type AgentActivity } from './conversation/agentActivity';
import { subjectOf, type ToolCallSummary } from './conversation/toolTrace';
import { planInterrupt, openDecisions, fillDecision } from './lib/interruptPlan';
import WelcomeSuggestions from './conversation/WelcomeSuggestions';
import ArtifactCanvas from './canvas/ArtifactCanvas';
import { PolarisAvatar, LabMark } from './PolarisMark';
import InterviewOverlay from './interview/InterviewOverlay';
import LivingCanvas, { type BatchRequest, type FocusRequest } from './canvas/living/LivingCanvas';
import { type BatchKind, type TargetedSelectionDiff } from './lib/diffResume';
import type { MultiPersonaResumeAnalysis } from '@/types/agent/multi-persona';
import type { FitReport } from '@/types/agent/fit-report';
import { streamChat, approveTool, endSessionThread, streamPdfParse, AgentRequestError, type HitlDecision } from './lib/services/agentClient';
import { fromSseEvent } from '@/lib/errors/normalize';
import { errorText } from '@/lib/errors/present';
import type { AgentLlmConfig, AgentSseEvent } from './lib/services/types';
import {
  invalidateAiEntitlement,
  isQuotaOrCustomConfigError,
  resolveAiAccessConfig,
} from './lib/services/aiAccess';
import { resolveResumePatchBatch } from './lib/resumePatch';
import { coerceSectionOrder } from '@/lib/utils/resumeSectionOrder';
import { useResumeDraftStore } from '@/store/useResumeDraftStore';
import { useSettingStore } from '@/store/useSettingStore';
import { diffResumeToChanges } from './lib/diffResume';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import type { AiChangesDroppedPayload } from '@/lib/extensions/app-lifecycle';
import { useAiSessionStore } from '@/store/useAiSessionStore';
import { ModelConfigFields } from '@/components/llm/ModelConfigFields';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import i18nInstance from '@/i18n';
import { useEntitlement } from '@/lib/extensions/billing-client';
import { isCloudMode } from '@/lib/config/app';

type AiChatShellProps = {
  resumeData: Resume;
  templateId: string;
  onClose: () => void;
  onApplySections: (sections: Section) => void;
  onApplyInfo: (info: InfoType) => void;
  onApplyFullResume: (resume: Resume) => void;
  setIsAiJobRunning: (running: boolean) => void;
};

const CLOSED_CANVAS: CanvasState = { open: false, skillId: null, view: 'preview', status: 'idle' };

/** 上报技能开始。所有技能都从同一个函数进来，所以起始只在这一处宣告。 */
function reportSkillStarted(id: SkillId) {
  if (id === 'optimize') appLifecycle.aiOptimizationStarted();
  else if (id === 'analyze') appLifecycle.aiAnalysisStarted();
  else if (id === 'create') appLifecycle.aiCreateStarted();
  else if (id === 'interview') appLifecycle.aiInterviewStarted();
}

/** 上报技能失败。只带粗粒度原因，绝不带上游报错——它可能把用户简历原样回显出来。 */
function reportSkillFailed(id: SkillId | null, reason: 'quota' | 'unknown') {
  if (id === 'optimize') appLifecycle.aiOptimizationFailed({ reason });
  else if (id === 'analyze') appLifecycle.aiAnalysisFailed({ reason });
}
/** Localized at call time — module-level, so it reads the i18n instance directly. */
const aiServiceErrorMessage = () => i18nInstance.t('aiLab.error.serviceUnavailable');

/** 内容技能无文字启动时的默认意图。这是**可见**的用户轮次（后端会跟随其语言），所以随 UI 语言走。 */
const SKILL_INTENT: Partial<Record<SkillId, () => string>> = {
  optimize: () => i18nInstance.t('aiLab.intent.optimize'),
  translate: () => i18nInstance.t('aiLab.intent.translate'),
  fit: () => i18nInstance.t('aiLab.intent.fit'),
};

/** 等用户补上 LLM key 才执行的动作，闸门满足后重放。 */
type PendingRun =
  | { kind: 'analyze' }
  | { kind: 'content'; skill: BatchKind; message: string }
  | { kind: 'chat'; history: { role: 'user' | 'assistant'; content: string }[]; mode: 'create' | 'general' };

/** Map the visible thread into chat history (user/assistant text only). */
function toBackendHistory(
  msgs: ChatMessage[]
): { role: 'user' | 'assistant'; content: string }[] {
  return msgs
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
}

function resolveState<T>(next: React.SetStateAction<T>, prev: T): T {
  return typeof next === 'function' ? (next as (value: T) => T)(prev) : next;
}

export default function AiChatShell({
  resumeData,
  templateId,
  onClose,
  onApplySections,
  onApplyInfo,
  onApplyFullResume,
  setIsAiJobRunning,
}: AiChatShellProps) {
  const { t } = useTranslation();
  const resumeId = resumeData.id;
  const aiSession = useAiSessionStore((s) => s.sessions[resumeId]);
  const loadAiSession = useAiSessionStore((s) => s.loadSession);
  const patchAiSession = useAiSessionStore((s) => s.patchSession);
  const resetAiSession = useAiSessionStore((s) => s.resetSession);
  const flushAiSession = useAiSessionStore((s) => s.flushSession);
  const started = aiSession?.started ?? false;
  // useMemo：`?? []` 每次渲染都产出新数组，会让依赖 messages 的 effect 每帧重跑。
  const messages = useMemo(() => aiSession?.messages ?? [], [aiSession?.messages]);
  const canvas = aiSession?.canvas ?? CLOSED_CANVAS;
  const chatMode = aiSession?.chatMode ?? 'idle';
  const agentMode: AgentMode = aiSession?.agentMode ?? 'cocreate';
  const livingOpen = aiSession?.livingOpen ?? false;
  const livingSkillId = aiSession?.livingSkillId ?? null;
  const analysis = aiSession?.analysis ?? null;
  const fitReport = aiSession?.fitReport ?? null;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [running, setRunning] = useState(false);
  /**
   * Agent 此刻在干什么。由 SSE 事件推导，不是猜的——见 conversation/agentActivity.ts。
   * 此前这些事件里除了 read_resume 之外全被丢弃，界面上所有等待都长一个样。
   */
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  // 经「询问 Polaris」抬进输入框的画布片段。
  const [quoted, setQuoted] = useState<
    { path: string; label: string; text: string; selectionText?: string } | null
  >(null);
  const [batchRequest, setBatchRequest] = useState<BatchRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const batchNonce = useRef(0);
  /**
   * 本轮用户主动关过实时画布吗。
   *
   * 普通对话现在也会自动展开画布评审，但「自动」必须让位于用户的明确动作：关掉之后
   * 同一轮里不该再弹回来——那是产品在跟用户拔河。改动仍在，只是改用一行日志提示。
   */
  const canvasDismissedForRun = useRef(false);
  const focusNonce = useRef(0);
  // 整篇技能运行期间置位，让它的 resume_update 走 living canvas 而不是聊天草稿条。
  // 要挺过 read_resume 的审批暂停，新运行开始时重置。
  const skillBatchRunRef = useRef<
    { kind: BatchKind; lang?: string; targetedSelection?: TargetedSelectionDiff } | null
  >(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [draftReady, setDraftReady] = useState<Resume | null>(null);
  // 暂停中的那次中断。裁决按动作下标归位，全部到齐才续跑——后端要求裁决数与动作数相等。
  const pendingInterruptRef = useRef<{
    requestId: string;
    decisions: (HitlDecision | null)[];
  } | null>(null);
  // consumeStream 需要在「问答」模式下替用户拒掉读简历的请求，但 answerInterrupt
  // 反过来依赖 consumeStream。用 ref 打破这个环——赋值在 answerInterrupt 定义之后。
  const answerInterruptRef = useRef<
    ((slot: ChatMessage['interruptSlot'], decision: HitlDecision) => void) | null
  >(null);
  const getCurrentAiSession = useCallback(
    () => useAiSessionStore.getState().ensureSession(resumeId),
    [resumeId]
  );
  const setStarted = useCallback(
    (next: React.SetStateAction<boolean>) => {
      const prev = getCurrentAiSession().started;
      patchAiSession(resumeId, { started: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setMessages = useCallback(
    (next: React.SetStateAction<ChatMessage[]>) => {
      const prev = getCurrentAiSession().messages;
      patchAiSession(resumeId, { messages: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setCanvas = useCallback(
    (next: React.SetStateAction<CanvasState>) => {
      const prev = getCurrentAiSession().canvas;
      patchAiSession(resumeId, { canvas: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setChatMode = useCallback(
    (next: React.SetStateAction<'idle' | 'create'>) => {
      const prev = getCurrentAiSession().chatMode;
      patchAiSession(resumeId, { chatMode: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setAgentMode = useCallback(
    (next: AgentMode) => patchAiSession(resumeId, { agentMode: next }),
    [patchAiSession, resumeId]
  );
  /**
   * 模式闸门。
   *
   * 走 ref 而不是把 agentMode 塞进 consumeStream 的依赖：那会让每次切模式都重建
   * 整个流消费者，正在飞行的运行会被连带掀掉。事件是实时到达的,读 ref 拿到的
   * 本来就是"此刻"的模式,正是我们要的语义。
   */
  const agentModeRef = useRef<AgentMode>(agentMode);
  agentModeRef.current = agentMode;
  // 档位随每轮以 `agentMode` 枚举发出，契约文本由服务端持有。
  //
  // 曾经是随消息发一条 `role:'system'` 的契约——**那条从没到过模型**：会话带线程
  // id 时服务端每轮只取最后一条 user 消息，system 被整条丢弃。改传枚举后契约在
  // 服务端注入，既不进会话历史（切档位不留旧契约），也堵死了客户端塞任意系统
  // 提示的口子。
  /** 「问答」模式不发 resumeId——不读简历这件事从请求本身就成立,而不是靠模型自觉。 */
  const scopedResumeId = useCallback(
    () => (AGENT_MODES[agentModeRef.current].allowsResumeRead ? resumeData.id : undefined),
    [resumeData.id]
  );
  const setLivingOpen = useCallback(
    (next: React.SetStateAction<boolean>) => {
      const prev = getCurrentAiSession().livingOpen;
      patchAiSession(resumeId, { livingOpen: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setLivingSkillId = useCallback(
    (next: React.SetStateAction<SkillId | null>) => {
      const prev = getCurrentAiSession().livingSkillId;
      patchAiSession(resumeId, { livingSkillId: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setAnalysis = useCallback(
    (next: React.SetStateAction<MultiPersonaResumeAnalysis | null>) => {
      const prev = getCurrentAiSession().analysis;
      patchAiSession(resumeId, { analysis: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  const setFitReport = useCallback(
    (next: React.SetStateAction<FitReport | null>) => {
      const prev = getCurrentAiSession().fitReport;
      patchAiSession(resumeId, { fitReport: resolveState(next, prev) });
    },
    [getCurrentAiSession, patchAiSession, resumeId]
  );
  // 一次对话 = 一个 sessionId，随可见记录一起持久化：关闭只是收起，"新对话"才重置。
  const sessionIdRef = useRef('');
  // 在飞行的运行：controller 负责中止，generation 让被顶替的回调提前返回而非写进新会话。
  const controllerRef = useRef<AbortController | null>(null);
  const runGenRef = useRef(0);
  // 运行函数是共用的，失败时流里没有别的办法说明是哪个技能在跑。
  const activeSkillRef = useRef<SkillId | null>(null);
  const interviewStartedAtRef = useRef<number | null>(null);

  /** 结束面试并上报时长。用开始时间戳把关，避免关闭/卸载等路径各报一次从未开始的面试。 */
  const reportInterviewEnded = useCallback(() => {
    const startedAt = interviewStartedAtRef.current;
    if (startedAt === null) return;
    interviewStartedAtRef.current = null;
    appLifecycle.aiInterviewEnded({
      durationSec: Math.round((Date.now() - startedAt) / 1000),
    });
  }, []);
  if (aiSession?.sessionId) sessionIdRef.current = aiSession.sessionId;
  // 本会话是否已在服务端开过状态，供"新对话"回收；关闭弹窗故意保留会话。
  const sessionUsedRef = useRef(false);
  if (aiSession) sessionUsedRef.current = aiSession.sessionUsed;
  const markSessionUsed = useCallback(() => {
    sessionUsedRef.current = true;
    patchAiSession(resumeId, { sessionUsed: true });
  }, [patchAiSession, resumeId]);
  useEffect(() => {
    let active = true;
    void loadAiSession(resumeId).then((loaded) => {
      if (!active) return;
      sessionIdRef.current = loaded.sessionId;
      sessionUsedRef.current = loaded.sessionUsed;
    });
    return () => {
      active = false;
      void flushAiSession(resumeId);
    };
  }, [flushAiSession, loadAiSession, resumeId]);
  // 卸载时中止在飞行的运行并失效回调；不删服务端会话——对话可恢复，"新对话"才显式清理。
  useEffect(
    () => () => {
      runGenRef.current += 1;
      controllerRef.current?.abort();
      setIsAiJobRunning(false);
    },
    [setIsAiJobRunning]
  );
  const setResumeDraft = useResumeDraftStore((s) => s.setResumeDraft);
  const { saveSettings, hasLlmConfig } = useSettingStore();
  const [configGateOpen, setConfigGateOpen] = useState(false);
  const pendingRunRef = useRef<PendingRun | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // analyze 的实时清单卡：首个 plan_update 时创建，记住 id 让后续更新落到同一张卡。
  const planCardRef = useRef<string | null>(null);
  // 活跃子代理名。置位期间 plan_update 走它自己的清单卡，原始 token 不进主气泡。
  const activeSubagentRef = useRef<string | null>(null);
  // 子代理自己的清单卡——与 planCardRef 分开，否则中途起子代理会让主卡永远停在"工作中"。
  const subagentPlanCardRef = useRef<string | null>(null);
  /** 本轮的工具追踪卡。一轮一张，跨工具累加。 */
  const toolTraceRef = useRef<string | null>(null);
  // read_resume 审批卡横跨两条流，记住 id 才能就地更新同一张卡的页脚而不是另起一行。
  const readApprovalRef = useRef<string | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, [setMessages]);

  /**
   * 会话是从本地记录恢复的：任何还挂着 pending 的卡都属于一次早已结束的运行
   * （后端线程有 TTL 回收），点它必然失败。恢复后一次性标成过期，让它看起来就
   * 不可点，而不是等用户点下去才发现。
   *
   * 用 ref 而不是 [] 依赖：消息是 IndexedDB 异步水合进来的，挂载那一帧往往还是空的。
   */
  const staleSweptRef = useRef(false);
  useEffect(() => {
    if (staleSweptRef.current || messages.length === 0) return;
    staleSweptRef.current = true;
    const hasStale = messages.some(
      (m) =>
        m.widget?.status === 'pending' ||
        m.approvals?.some((a) => a.status === 'pending'),
    );
    if (!hasStale) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.widget?.status === 'pending') {
          return { ...m, widget: { ...m.widget, status: 'expired' as const } };
        }
        if (m.approvals?.some((a) => a.status === 'pending')) {
          return {
            ...m,
            approvals: m.approvals.map((a) =>
              a.status === 'pending' ? { ...a, status: 'expired' as const } : a,
            ),
          };
        }
        return m;
      }),
    );
  }, [messages, setMessages]);

  const addAssistant = useCallback(
    (content: string) => addMessage({ id: nanoid(), role: 'assistant', content }),
    [addMessage]
  );

  const logChange = useCallback(
    (content: string, resumePath?: string, tone?: 'ok' | 'info') =>
      addMessage({ id: nanoid(), role: 'log', content, resumePath, tone }),
    [addMessage]
  );

  /**
   * 一次简历改动没能落到画布上——说出来。
   *
   * 这条链路上原本有八处静默丢弃（模式闸门、载荷畸形、帧解析失败、diff 为空、锚点缺失…），
   * 每一处最多打一句 console.warn。用户那边的表现完全一样：模型说「已经改好了」，画布纹丝
   * 不动，没有任何东西告诉他刚才什么都没发生。
   *
   * 选聊天流当主界面，是因为它和模型的宣称**在同一列**——两句话挨着，用户不必自己推断谁对；
   * 而且它进 transcript 可回溯，画布卸载也不会跟着消失。`console.warn` 一律保留给排查。
   */
  const warnDropped = useCallback(
    (
      content: string,
      reason: AiChangesDroppedPayload['reason'],
      extra?: { count?: number; detail?: unknown }
    ) => {
      console.warn(`[ai] ${content}`, extra?.detail ?? '');
      addMessage({ id: nanoid(), role: 'log', content, tone: 'warn' });
      // 同一个汇聚处既说给用户听、也报给我们自己：少了后半句，这类故障只能等人来报，
      // 而它恰恰是那种「用户觉得产品坏了但懒得说」的失败。
      appLifecycle.aiChangesDropped({ reason, count: extra?.count });
    },
    [addMessage]
  );

  /**
   * 落一张非阻塞推送来的卡（`ui_widget`）。同 widgetId 再推一次是更新同一张卡，
   * 不是又冒一张——进度、逐步填充的结果卡都靠这个。这类卡不占中断槽，流照跑。
   */
  const upsertWidget = useCallback(
    (widgetId: string, envelope: WidgetEnvelope) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.widget?.widgetId === widgetId);
        if (idx === -1) {
          return [
            ...prev,
            {
              id: nanoid(),
              role: 'widget',
              widget: { widgetId, kind: envelope.kind, props: envelope.props ?? {}, status: 'pending' },
            },
          ];
        }
        const existing = prev[idx].widget!;
        const next = [...prev];
        next[idx] = {
          ...prev[idx],
          widget: {
            ...existing,
            kind: envelope.kind,
            props: envelope.merge
              ? { ...existing.props, ...(envelope.props ?? {}) }
              : envelope.props ?? {},
          },
        };
        return next;
      });
    },
    [setMessages]
  );

  // 把最近一条进行中的工具活动置成完成态，免得它一直转圈。
  const markActivityDone = useCallback((doneText: string) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'activity' && prev[i].status === 'running') {
          const next = prev.slice();
          next[i] = { ...next[i], status: 'done', content: doneText };
          return next;
        }
      }
      return prev;
    });
  }, [setMessages]);

  const markReadActivityDone = useCallback(
    () => markActivityDone('已读取简历'),
    [markActivityDone]
  );

  // 推进审批卡页脚的读取状态，让三段文案集中在一处。
  const setApprovalReadState = useCallback(
    (msgId: string, readState: 'reading' | 'read') => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.approvals
            ? {
                ...m,
                // 只动读简历那一页：同一张卡上可能还有别的闸门，它们的状态与这次读取无关。
                approvals: m.approvals.map((a) =>
                  a.toolName === 'read_resume' ? { ...a, readState } : a
                ),
              }
            : m
        )
      );
    },
    [setMessages]
  );

  // 点日志条目 → 重开画布并滚到对应位置。
  const focusOnCanvas = useCallback((resumePath: string) => {
    focusNonce.current += 1;
    setLivingOpen(true);
    setFocusRequest({ path: resumePath, nonce: focusNonce.current });
  }, [setLivingOpen]);

  const toggleLiving = useCallback(() => {
    setLivingOpen((open) => {
      const next = !open;
      if (next) {
        setStarted(true);
        setCanvas(CLOSED_CANVAS);
        setBatchRequest(null); // manual open starts clean — don't replay a prior skill batch
        setLivingSkillId(null);
      }
      return next;
    });
  }, [setCanvas, setLivingOpen, setLivingSkillId, setStarted]);

  // 整篇简历类技能的结果落到 living canvas 上作为就地待定改动，而不是开 Diff 标签页。
  const isBatchSkill = (id: SkillId) => id === 'optimize' || id === 'translate';

  // 当前暂停的中断：每个动作一个待填裁决槽，填满才续跑。
  const openInterrupt = useCallback((requestId: string, count: number) => {
    pendingInterruptRef.current = {
      requestId,
      decisions: openDecisions<HitlDecision>(count),
    };
  }, []);

  // 消费 AI 事件流。初始对话与审批后的续流共用它——两者事件 schema 相同，
  // 初始流在 `tool_approval_request` 处结束，批准会另开一条续流由同一个消费者排干。
  const consumeStream = useCallback(
    async (
      makeGen: (signal: AbortSignal) => AsyncGenerator<AgentSseEvent>,
      pendingOnQuota?: PendingRun,
    ) => {
      const aiId = nanoid();
      // 本轮模型给的逐条改动理由（`explain_changes`）。按 `section/itemId` 配到评审卡上；
      // 它先于 `resume_update` 到达，所以攒在这一轮的作用域里。
      const changeNotes = new Map<string, string>();
      // 气泡延迟到首个 chunk 才创建，好让 read_resume 活动行落在回复上方。
      let bubbleCreated = false;
      const ensureBubble = () => {
        if (bubbleCreated) return;
        addMessage({ id: aiId, role: 'assistant', content: '', status: 'running', streamed: true });
        bubbleCreated = true;
        setAwaitingReply(false);
      };

      // 顶替上一次运行：中止它并递增 generation，让它残留的回调提前返回。
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const myGen = ++runGenRef.current;
      const isCurrent = () => myGen === runGenRef.current;

      setRunning(true);
      setIsAiJobRunning(true);
      setAwaitingReply(true);
      setActivity('thinking');

      let acc = '';
      // 思考与正文分开累加：前者是过程，不进 content、不入库、不参与历史。
      let reasoningAcc = '';
      // 记住"因审批暂停"，否则收尾时会在审批卡后留下一个空气泡。
      let pausedForApproval = false;
      const patchHandledRunIds = new Set<string>();
      canvasDismissedForRun.current = false;
      let patchHandledWithoutRunId = false;
      try {
        for await (const ev of makeGen(controller.signal)) {
          // 已被更新的运行（或卸载）顶替，不要再碰状态。
          if (!isCurrent()) return;
          if (ev.type === 'reasoning_chunk' && ev.content) {
            // 思考先于正文到达：气泡此时还没建（它等首个正文 chunk），所以这里要
            // 自己把气泡拉起来，否则思考只能等正文出现才有地方放——而推理模型恰恰
            // 是「想很久、然后才开口」，那段最该被看见的等待就又变成一片空白。
            if (!activeSubagentRef.current) {
              ensureBubble();
              reasoningAcc += ev.content;
              const text = reasoningAcc;
              setMessages((prev) =>
                prev.map((m) => (m.id === aiId ? { ...m, reasoning: text } : m)),
              );
            }
          } else if (ev.type === 'message_chunk' && ev.content) {
            setActivity('writing');
            // 子代理的原始 token 不进聊天：它的进度在自己的清单卡上，结果走 resume_update。
            if (!activeSubagentRef.current) {
              ensureBubble();
              acc += ev.content;
              setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, content: acc } : m)));
            }
          } else if (ev.type === 'tool_approval_request') {
            // 敏感工具（read_resume）前暂停，或用 GenUI 组件收集输入。流到此结束，由卡片驱动续流。
            const p = ev.payload as {
              requestId?: string;
              toolName?: string;
              reason?: string;
              args?: Record<string, unknown>;
              actions?: { name?: string; args?: Record<string, unknown> }[];
            } | undefined;
            if (p?.requestId) {
              pausedForApproval = true;
              setActivity('awaiting');
              setAwaitingReply(false); // the card replaces the thinking dots
              // 一次中断可能挂着多个动作。只渲染第一个会漏卡，而续跑要求裁决数与动作数
              // 相等（engine 的 assertValidDecisions），漏掉的那个必然 400。
              const requestId = p.requestId;
              const actions = p.actions?.length
                ? p.actions
                : [{ name: p.toolName, args: p.args }];
              openInterrupt(requestId, actions.length);
              // 「问答」模式承诺了不读简历。弹一张「要不要读简历」的卡等于把已经作过的
              // 承诺又推回给用户,所以这里直接替他拒掉,并把理由带给模型让它换个说法。
              // 判定在 `interruptPlan` 里（纯函数，有用例钉着）；这里只负责画出来。
              const plan = planInterrupt(requestId, actions, {
                hasWidget: (kind) => Boolean(WIDGETS[kind]),
                resolveKind: (toolName, args) =>
                  toolName === 'ask_choice' ? askChoiceKind(args) : toolName,
                allowsResumeRead: AGENT_MODES[agentModeRef.current].allowsResumeRead,
              });
              const autoRejected = plan.autoRejected;
              const gates = plan.gates;
              plan.widgets.forEach((w) => {
                addMessage({
                  id: nanoid(),
                  role: 'widget',
                  interruptSlot: w.slot,
                  widget: {
                    widgetId: `${requestId}#${w.slot.index}`,
                    kind: w.kind as WidgetKind,
                    toolName: w.toolName,
                    props: w.args,
                    status: 'pending',
                  },
                });
              });
              if (gates.length) {
                const approvalId = nanoid();
                // 读简历那一页的进度（正在读→已读取）要能找回这张卡。
                if (gates.some((g) => g.toolName === 'read_resume')) {
                  readApprovalRef.current = approvalId;
                }
                addMessage({
                  id: approvalId,
                  role: 'approval',
                  content: p.reason || '想读取你的简历来给建议',
                  approvals: gates,
                });
              }
              if (autoRejected.length) {
                // 延到本轮事件循环之后:裁决会另起一条续流并 abort 当前 controller,
                // 而我们此刻正站在它的 for await 里。等这条流自然收尾再动手。
                window.setTimeout(() => {
                  autoRejected.forEach((slot) =>
                    // 这句是**发给模型**的，不是界面文案：写死中文等于对英文会话里的模型
                    // 说中文。工具层与提示词层通篇英文，跟着它走。
                    answerInterruptRef.current?.(slot, {
                      type: 'reject',
                      message:
                        'The user is in "Ask" mode, which does not allow reading the resume. Answer without looking at it; if the question genuinely requires the resume, say so and ask them to switch modes.',
                    })
                  );
                }, 0);
              }
            }
          } else if (ev.type === 'resume_verification') {
            // 反捏造闸门（确定性校验）的产出。后端一直在算，前端此前没有分支消费，
            // 校验结果跑完就丢了。走 widget 通道落成一张提示卡，不拦截改动。
            const items = (ev.payload as { suspectedFabrications?: unknown } | undefined)
              ?.suspectedFabrications;
            if (Array.isArray(items) && items.length) {
              upsertWidget(`verification:${ev.runId ?? 'run'}`, {
                kind: 'fabrication_notice',
                props: { items },
              });
            }
          } else if (ev.type === 'ui_widget') {
            // 非阻塞卡：不占中断槽,流继续跑。同 widgetId 二次推送是更新同一张卡。
            const envelope = (ev.payload ?? ev.data) as WidgetEnvelope | undefined;
            if (envelope?.kind) {
              upsertWidget(envelope.widgetId || nanoid(), envelope);
            }
          } else if (ev.type === 'llm_started') {
            // 模型开始生成、首字未到 = 思考中。之前这个事件整个被丢掉，于是「已经
            // 在想」和「还没开始」在界面上没有区别。
            setActivity((prev) => (prev === 'writing' ? prev : 'thinking'));
          } else if (ev.type === 'tool_started') {
            const payload = ev.payload as
              | { toolName?: string; toolCallId?: string; args?: unknown }
              | undefined;
            const toolName = payload?.toolName;
            // 认全部工具。写死只认 read_resume 是此前「看不出 agent 在干什么」的直接原因。
            setActivity(activityForTool(toolName));
            // 把这一轮动过的工具收成一张卡。此前除 read_resume 外全部不可见——跑完就没了，
            // 用户回头看不出它到底做了什么。
            if (toolName) {
              const call = {
                toolCallId: payload?.toolCallId ?? nanoid(),
                toolName,
                subject: subjectOf(payload?.args),
              };
              const traceId = toolTraceRef.current;
              if (traceId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === traceId
                      ? { ...m, toolCalls: [...(m.toolCalls ?? []), call], status: 'running' }
                      : m,
                  ),
                );
              } else {
                const id = nanoid();
                toolTraceRef.current = id;
                addMessage({ id, role: 'tools', content: '', toolCalls: [call], status: 'running' });
              }
            }
            if (toolName === 'read_resume') {
              // 读取进度显示在审批卡上，没有卡可更新时才退化成单独一行活动。
              if (readApprovalRef.current) {
                setApprovalReadState(readApprovalRef.current, 'reading');
              } else {
                addMessage({ id: nanoid(), role: 'activity', content: t('aiLab.chat.readingResume'), status: 'running' });
              }
            }
          } else if (ev.type === 'tool_completed') {
            // 工具收工但流还在跑：回到「思考中」，而不是停在上一个工具的形态上。
            setActivity((prev) => (prev === 'writing' || prev === 'awaiting' ? prev : 'thinking'));
            const doneId = (ev.payload as { toolCallId?: string } | undefined)?.toolCallId;
            const traceId = toolTraceRef.current;
            if (traceId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === traceId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((c) =>
                          !doneId || c.toolCallId === doneId ? { ...c, done: true } : c,
                        ),
                      }
                    : m,
                ),
              );
            }
          } else if (ev.type === 'tool_result') {
            // 摘要（「读到 4 个模块」）挂回对应的那次调用，芯片展开后才有东西可看。
            const p = ev.payload as
              | { toolCallId?: string; toolName?: string; summary?: ToolCallSummary }
              | undefined;
            const traceId = toolTraceRef.current;
            if (traceId && p?.summary && p.toolCallId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === traceId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((c) =>
                          c.toolCallId === p.toolCallId
                            ? { ...c, summary: p.summary }
                            : c,
                        ),
                      }
                    : m,
                ),
              );
            }
            if (p?.toolName === 'read_resume') {
              if (readApprovalRef.current) {
                setApprovalReadState(readApprovalRef.current, 'read'); // → 已读取简历
                readApprovalRef.current = null;
              } else {
                markReadActivityDone();
              }
            }
          } else if (ev.type === 'plan_update') {
            // 有子代理在跑就路由到它的卡，否则走主卡——两者不能撞在一起。
            const payload = ev.payload as { todos?: PlanTodo[]; label?: string } | undefined;
            const todos = payload?.todos;
            if (Array.isArray(todos)) {
              const allDone = todos.length > 0 && todos.every((t) => t.status === 'completed');
              const sub = activeSubagentRef.current;
              const ref = sub ? subagentPlanCardRef : planCardRef;
              if (ref.current) {
                const planId = ref.current;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === planId ? { ...m, todos, status: allDone ? 'done' : 'running' } : m
                  )
                );
              } else {
                const planId = nanoid();
                ref.current = planId;
                setAwaitingReply(false); // the todolist replaces the thinking dots
                // 卡片上的画布开关要指向正确的画面：批量技能→living canvas，analyze→score canvas。
                const canvasSkill: SkillId = skillBatchRunRef.current
                  ? skillBatchRunRef.current.kind
                  : 'analyze';
                addMessage({
                  id: planId,
                  role: 'plan',
                  ...(sub ? { subagentName: sub } : { skillId: canvasSkill }),
                  content: sub ? '' : payload?.label || '任务清单',
                  todos,
                  // 卡片自己走秒。以第一条 plan_update 为起点而不是 run_started：
                  // 用户看到的这张卡就是从这一刻开始的。
                  startedAt: Date.now(),
                  status: allDone ? 'done' : 'running',
                });
              }
            }
          } else if (ev.type === 'subagent_started') {
            // 到 subagent_completed 为止都算它的工作：给它独立的清单卡，原始 token 不进主气泡。
            const payload = ev.payload as
              | { name?: string; args?: { description?: string } }
              | undefined;
            const rawName = payload?.name;
            const task = payload?.args?.description?.trim();
            // 优先用子代理的类型名；通用 worker 退回它领到的任务，免得卡片只写"子代理"。
            const name =
              rawName && rawName !== '子代理' && rawName !== 'general-purpose'
                ? rawName
                : task
                  ? task.length > 36
                    ? `${task.slice(0, 36)}…`
                    : task
                  : '子代理';
            activeSubagentRef.current = name;
            setActivity('subagent');
            const planId = nanoid();
            subagentPlanCardRef.current = planId;
            setAwaitingReply(false);
            addMessage({
              id: planId,
              role: 'plan',
              subagentName: name,
              content: '',
              todos: [],
              status: 'running',
            });
          } else if (ev.type === 'subagent_completed') {
            activeSubagentRef.current = null;
            setActivity('thinking');
            if (subagentPlanCardRef.current) {
              const planId = subagentPlanCardRef.current;
              subagentPlanCardRef.current = null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === planId
                    ? { ...m, status: 'done', todos: (m.todos ?? []).map((t) => ({ ...t, status: 'completed' })) }
                    : m
                )
              );
            }
          } else if (ev.type === 'resume_change_notes') {
            const notes = (ev.payload as { notes?: { section?: string; itemId?: string; why?: string }[] } | undefined)?.notes;
            for (const n of notes ?? []) {
              if (n.section && n.itemId && n.why) changeNotes.set(`${n.section}/${n.itemId}`, n.why);
            }
          } else if (ev.type === 'resume_write_failed') {
            // 服务端断言：本轮试过改简历、一次都没成功。这条事件存在的全部意义，就是不让
            // 模型那句「我已经改好了」成为用户唯一能看到的信息。
            // 服务端已经断言过「一整轮没写成」，这是「没产出」不是「没送达」——单独一个事件。
            console.warn('[ai] resume_write_failed', ev.payload);
            addMessage({
              id: nanoid(),
              role: 'log',
              content: t('aiLab.chat.writeFailed'),
              tone: 'warn',
            });
            appLifecycle.aiWriteFailed({
              attempts: (ev.payload as { attempts?: number } | undefined)?.attempts,
            });
          } else if (ev.type === 'resume_patch' || ev.type === 'resume_update') {
            // 模式闸门（确定性，不靠提示词）：「规划 / 问答」两档不允许简历改动。
            // 模型偶尔仍会产出一份改写——这里丢掉它，用户的简历不会被碰。
            if (!AGENT_MODES[agentModeRef.current].allowsResumeEdits) {
              warnDropped(
                '当前是只读模式，这次简历改动已丢弃 · 切换到「共创」再试',
                'mode_readonly',
                { detail: `mode=${agentModeRef.current} type=${ev.type}` }
              );
              continue;
            }
            if (ev.type === 'resume_patch') {
            const batch = skillBatchRunRef.current;
            const resolved = resolveResumePatchBatch(resumeData, ev.data ?? ev.payload, batch);
            if (resolved) {
              if (ev.runId) patchHandledRunIds.add(ev.runId);
              else patchHandledWithoutRunId = true;
              batchNonce.current += 1;
              setCanvas(CLOSED_CANVAS);
              setLivingOpen(true);
              setLivingSkillId(resolved.kind);
              setBatchRequest({
                kind: resolved.kind,
                lang: resolved.lang,
                proposedSections: resolved.proposedSections,
                targetedSelection: resolved.targetedSelection,
                nonce: batchNonce.current,
                changeNotes,
              });
            } else {
              warnDropped('收到一份读不懂的简历改动，已忽略', 'malformed', {
                detail: ev.payload ?? ev.data,
              });
            }
            } else {
            const patchAlreadyHandled = ev.runId ? patchHandledRunIds.has(ev.runId) : patchHandledWithoutRunId;
            // 同一轮里已经按 patch 铺过画布了。这条全量更新是它的另一种表述，不是新改动——
            // 但它被吃掉这件事值得留个痕，否则「改动比预期少」无从查起。
            if (patchAlreadyHandled) {
              console.warn('[ai] dropping resume_update: this run already applied a patch');
              continue;
            }

            const raw = (ev.data ?? (ev.payload as { resume?: unknown } | undefined)?.resume) as
              | Resume
              | undefined;
            // sectionOrder 可能是 `["experience", …]`：渲染侧直接读 `s.key` 会全拿到
            // undefined，整份草稿渲染成空白且不报错。就地补形状，不补全区块。
            const draft = raw
              ? { ...raw, sectionOrder: coerceSectionOrder(raw.sectionOrder) }
              : undefined;
            // resume_update 必须带 keyed `sections`；畸形负载会让渲染器在 sections.<key> 上崩，宁可忽略并告警。
            const sections =
              draft && typeof draft === 'object' ? draft.sections : undefined;
            if (draft && sections && typeof sections === 'object' && !Array.isArray(sections)) {
              const batch = skillBatchRunRef.current;
              if (batch) {
                // optimize/translate → 在 living canvas 上按字段铺开真实 diff。
                batchNonce.current += 1;
                setCanvas(CLOSED_CANVAS);
                setLivingOpen(true);
                setLivingSkillId(batch.kind);
                setBatchRequest({
                  kind: batch.kind,
                  lang: batch.lang,
                  proposedSections: sections,
                  targetedSelection: batch.targetedSelection,
                  nonce: batchNonce.current,
                  changeNotes,
                });
              } else if (activeSkillRef.current === 'create') {
                // 引导创建：整份新简历没有 before 可 diff，草稿条才是它的正当用途。
                setResumeDraft(draft);
                setDraftReady(draft);
                // 在这里上报而不是流结束时：一次运行可能跑完却从没产出草稿。
                appLifecycle.aiCreateCompleted();
              } else {
                // 普通对话也走画布评审，与技能路径一致。此前这里只在输入框上方挂一条窄草稿条，
                // 右侧舞台宽度还停在 0%——用户视角同样是「说改了、画布没动」。
                //
                // 先算差异再决定界面：一句「帮我看看」引出的零改动不该把画布弹出来，
                // 那会让轻量问答变吵。这是防噪的核心闸门。
                const changed = diffResumeToChanges(
                  resumeData.sections,
                  sections,
                  'optimize',
                  undefined,
                  undefined,
                  undefined,
                  changeNotes
                );
                if (!changed.length) {
                  warnDropped('这次没有产生可评审的改动', 'no_changes');
                } else if (canvasDismissedForRun.current) {
                  // 本轮用户主动关过画布：尊重它，别再弹回来。
                  logChange(`有 ${changed.length} 处改动待评审 · 打开画布查看`);
                } else {
                  batchNonce.current += 1;
                  setCanvas(CLOSED_CANVAS);
                  setLivingOpen(true);
                  setLivingSkillId('optimize');
                  setBatchRequest({
                    kind: 'optimize',
                    proposedSections: sections,
                    nonce: batchNonce.current,
                    changeNotes,
                  });
                }
              }
            } else {
              warnDropped('收到一份缺少区块结构的简历，已忽略', 'malformed', {
                detail: draft,
              });
            }
            }
          } else if (ev.type === 'resume_analysis') {
            // analyze_resume 跑完，把多角色结果呈到 ScoreView 画布。
            const result = (ev.data ?? (ev.payload as { data?: unknown } | undefined)?.data) as
              | MultiPersonaResumeAnalysis
              | undefined;
            if (result && typeof result === 'object') {
              setAnalysis(result);
              setLivingOpen(false);
              setCanvas({ open: true, skillId: 'analyze', view: 'score', status: 'ready' });
              // 真出了结果才算成功：只流不产出不是成功。
              appLifecycle.aiAnalysisSucceeded();
              // 收尾时把清单全置完成（防御：汇总步骤的 plan_update 可能晚于本事件）。
              if (planCardRef.current) {
                const planId = planCardRef.current;
                planCardRef.current = null;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === planId
                      ? {
                          ...m,
                          status: 'done',
                          todos: m.todos?.map((t) => ({ ...t, status: 'completed' })),
                        }
                      : m
                  )
                );
              }
            }
          } else if (ev.type === 'fit_report') {
            // evaluate_fit 跑完，把简历 × JD 的匹配报告呈到 MatchView 画布。
            const report = (ev.data ?? (ev.payload as { data?: unknown } | undefined)?.data) as
              | FitReport
              | undefined;
            if (report && typeof report === 'object') {
              setFitReport(report);
              setLivingOpen(false);
              setCanvas({ open: true, skillId: 'fit', view: 'match', status: 'ready' });
              // 收尾时把清单全置完成（防御：汇总步骤的 plan_update 可能晚于本事件）。
              if (planCardRef.current) {
                const planId = planCardRef.current;
                planCardRef.current = null;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === planId
                      ? {
                          ...m,
                          status: 'done',
                          todos: m.todos?.map((t) => ({ ...t, status: 'completed' })),
                        }
                      : m
                  )
                );
              }
            }
          } else if (ev.type === 'error') {
            // 归一化成 AppError 再抛：下游的额度闸门与文案都读码，不再从字符串里往回猜。
            // 老部署可能仍发原始上游报错，`fromSseEvent` 只取契约字段，原文进不来。
            throw new AgentRequestError(fromSseEvent(ev));
          }
        }
        if (pausedForApproval && !bubbleCreated) {
          // 一个字都没出就停在审批：卡片就是这一段的终点，续流等用户决定。
        } else {
          ensureBubble();
          setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, status: 'done' } : m)));
        }
      } catch (err) {
        // 被用户中止或被新运行顶替，不算失败。
        if (controller.signal.aborted || !isCurrent()) {
          return;
        }
        // 过了中止判断才是真失败——放在上面会把每次取消都算成失败。
        reportSkillFailed(
          activeSkillRef.current,
          isQuotaOrCustomConfigError(err) ? 'quota' : 'unknown',
        );
        if (isQuotaOrCustomConfigError(err)) {
          const refreshedAccess = await resolveAiAccessConfig({ forceRefresh: true }).catch(() => null);
          if (refreshedAccess?.ok && refreshedAccess.config.source === 'internal') {
            const msg = aiServiceErrorMessage();
            ensureBubble();
            setMessages((prev) =>
              prev.map((m) => (m.id === aiId ? { ...m, content: acc || `（${msg}）`, status: 'done' } : m))
            );
            toast.error(msg);
            return;
          }
          invalidateAiEntitlement();
          if (pendingOnQuota) pendingRunRef.current = pendingOnQuota;
          setStarted(true);
          setConfigGateOpen(true);
          const msg = errorText(err, aiServiceErrorMessage());
          ensureBubble();
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: acc || `（${msg}）`, status: 'done' } : m))
          );
          toast.error(msg);
          return;
        }
        ensureBubble();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? { ...m, content: acc || `（${errorText(err, aiServiceErrorMessage())}）`, status: 'done' }
              : m
          )
        );
        toast.error(aiServiceErrorMessage());
      } finally {
        // 只有当前运行能清理共享 UI 状态，被顶替的运行不许关掉新运行的转圈。
        if (isCurrent()) {
          markReadActivityDone(); // resolve any read line still spinning
          // 主卡和子代理卡都要收尾，否则流中途结束/出错时它们会一直转圈。
          activeSubagentRef.current = null;
          for (const ref of [planCardRef, subagentPlanCardRef]) {
            if (!ref.current) continue;
            const planId = ref.current;
            ref.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === planId
                  ? {
                      ...m,
                      status: 'done',
                      todos: m.todos?.map((t) =>
                        t.status === 'in_progress' ? { ...t, status: 'pending' } : t
                      ),
                    }
                  : m
              )
            );
          }
          setRunning(false);
          setIsAiJobRunning(false);
          setAwaitingReply(false);
          setActivity(null);
          controllerRef.current = null;
        }
      }
    },
    [
      t,
      addMessage,
      warnDropped,
      logChange,
      setStarted,
      markReadActivityDone,
      openInterrupt,
      upsertWidget,
      resumeData,
      setAnalysis,
      setFitReport,
      setApprovalReadState,
      setCanvas,
      setLivingOpen,
      setLivingSkillId,
      setMessages,
      setResumeDraft,
      setIsAiJobRunning,
    ]
  );

  // AI 访问闸门：先走账户额度，退回 BYOK。
  const resolveRunConfig = useCallback(
    async (pending: PendingRun): Promise<AgentLlmConfig | null> => {
      // 一点就给反馈：内置额度路径要先往返一次 /ai-entitlement，不能等它回来才转圈。
      setRunning(true);
      setIsAiJobRunning(true);
      setAwaitingReply(true);
      const access = await resolveAiAccessConfig({
        forceRefresh: configGateOpen || Boolean(pendingRunRef.current),
      });
      if (access.ok) {
        pendingRunRef.current = null;
        setConfigGateOpen(false);
        return access.config;
      }
      // 不会进入流了，把乐观设上的 loading 清掉。
      setRunning(false);
      setIsAiJobRunning(false);
      setAwaitingReply(false);
      if (access.reason === 'entitlement_unavailable') {
        toast.error('账户额度检查失败，请稍后重试');
        return null;
      }
      pendingRunRef.current = pending;
      setStarted(true); // reveal the thread/composer area so the gate card is in view
      setConfigGateOpen(true);
      return null;
    },
    [configGateOpen, setStarted, setIsAiJobRunning],
  );

  // analyze：会话内运行，流出清单 + 最终分析结果；清单卡由 consumeStream 经 planCardRef 拥有。
  const runAnalyze = useCallback(
    async () => {
      const pending: PendingRun = { kind: 'analyze' };
      const config = await resolveRunConfig(pending);
      if (!config) return;
      planCardRef.current = null; // a fresh review todolist for this run
      // 同理：新一轮要新开一张工具追踪卡，否则这一轮的工具会追加进上一轮那张。
      toolTraceRef.current = null;
      skillBatchRunRef.current = null; // not a whole-resume skill batch run
      await consumeStream(
        (signal) =>
          streamChat({
            messages: [{ role: 'user', content: SKILLS.analyze.buildIntent({}) }],
            agentMode: agentModeRef.current,
            mode: 'analyze',
            // 不带 sessionId：analyze 是一次性变换，sessionId 留给 create/general 对话。
            resumeId: scopedResumeId(),
            config,
            signal,
          }),
        pending,
      );
    },
    [consumeStream, resolveRunConfig, scopedResumeId]
  );

  /**
   * 岗位匹配（evaluate_fit）。刻意不走 runContentSkill：它产出的是一份报告而不是简历
   * 改动，置位 skillBatchRunRef 会把后续任何 resume_update 误当成整篇改写铺到画布上。
   * 需要 sessionId——没有 JD 时模型会先弹 FormCard，那是一次跨轮的中断。
   */
  const runFit = useCallback(
    async (message: string) => {
      const pending: PendingRun = { kind: 'chat', history: [{ role: 'user', content: message }], mode: 'general' };
      const config = await resolveRunConfig(pending);
      if (!config) return;
      planCardRef.current = null;
      skillBatchRunRef.current = null;
      markSessionUsed();
      await consumeStream(
        (signal) =>
          streamChat({
            messages: [{ role: 'user', content: message }],
            agentMode: agentModeRef.current,
            mode: 'fit',
            sessionId: sessionIdRef.current,
            resumeId: scopedResumeId(),
            config,
            signal,
          }),
        pending,
      );
    },
    [consumeStream, resolveRunConfig, markSessionUsed, scopedResumeId]
  );

  // 整篇内容技能（optimize / translate）走会话式运行：不弹参数框，需要细节时在对话里用
  // FormCard 收集；最终整篇更新 diff 到 living canvas（skillBatchRunRef 要挺过表单中断）。
  const runContentSkill = useCallback(
    async (kind: BatchKind, message: string) => {
      const pending: PendingRun = { kind: 'content', skill: kind, message };
      const config = await resolveRunConfig(pending);
      if (!config) return;
      setCanvas(CLOSED_CANVAS);
      setLivingSkillId(kind);
      skillBatchRunRef.current = { kind };
      markSessionUsed(); // multi-turn (ask → fill → optimize) needs the thread
      void consumeStream(
        (signal) =>
          streamChat({
            messages: [{ role: 'user', content: message }],
            agentMode: agentModeRef.current,
            mode: kind,
            sessionId: sessionIdRef.current,
            resumeId: scopedResumeId(),
            config,
            signal,
          }),
        pending,
      );
    },
    [
      consumeStream,
      resolveRunConfig,
      markSessionUsed,
        scopedResumeId,
      setCanvas,
      setLivingSkillId,
    ]
  );

  // 一张卡答完：裁决按下标归位，同一次中断的卡全答完才续跑。
  const answerInterrupt = useCallback(
    (slot: ChatMessage['interruptSlot'], decision: HitlDecision) => {
      const pending = pendingInterruptRef.current;
      if (!slot || !pending || pending.requestId !== slot.requestId) {
        // 会话从本地记录恢复,后端线程早已被回收——续跑必失败,不如直说。
        addAssistant(t('aiLab.chat.interruptExpired'));
        return;
      }
      const filled = fillDecision(pending.decisions, slot.index, decision);
      pending.decisions = filled.slots;
      if (!filled.ready) return; // 还有卡没答

      const decisions = filled.slots as HitlDecision[];
      pendingInterruptRef.current = null;
      // 卡片自己已经变成「已提交」，但线程这边到续流开始之间还有一段异步（解析模型
      // 配置、可能弹补 key）。不先置位的话，这段时间界面上什么都没有在发生。
      setAwaitingReply(true);
      void (async () => {
        const run: PendingRun = {
          kind: 'chat',
          history: toBackendHistory(messagesRef.current),
          mode: 'general',
        };
        const config = await resolveRunConfig(run);
        if (!config) {
          setAwaitingReply(false); // 卡在补 key 闸门上，别留一个永远转下去的等待态
          return;
        }
        await consumeStream(
          (signal) =>
            approveTool({
              sessionId: sessionIdRef.current,
              decisions,
              resumeId: scopedResumeId(),
              // 续跑也要带档位，否则批准之后那半程回到无约束状态。
              agentMode: agentModeRef.current,
              config,
              signal,
            }),
          run,
        );
      })();
    },
    [addAssistant, consumeStream, resolveRunConfig, t, scopedResumeId]
  );
  answerInterruptRef.current = answerInterrupt;

  // 用户操作了 GenUI 卡片：标记已处理，并经 HITL 通道恢复暂停的运行。
  // create / general：流式对话，发送按 sessionId 划定的可见轮次历史。
  const runChat = useCallback(
    async (history: { role: 'user' | 'assistant'; content: string }[], mode: 'create' | 'general') => {
      const pending: PendingRun = { kind: 'chat', history, mode };
      const config = await resolveRunConfig(pending);
      if (!config) return;
      skillBatchRunRef.current = null; // not a whole-resume skill batch run
      markSessionUsed(); // server-side session now exists → reclaim on explicit new chat
      return consumeStream(
        (signal) =>
          streamChat({
            messages: history,
            agentMode: agentModeRef.current,
            mode,
            sessionId: sessionIdRef.current,
            // 把对话限定到这份简历，又不必每轮推送整份快照。
            resumeId: scopedResumeId(),
            config,
            signal,
          }),
        pending,
      );
    },
    [consumeStream, resolveRunConfig, markSessionUsed, scopedResumeId]
  );

  // 审批卡上的**一页**答完了：裁决按该页自己的下标归位，全答完才续跑。
  const handleApproval = useCallback(
    (msgId: string, pageIndex: number, approved: boolean) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.approvals
            ? {
                ...m,
                approvals: m.approvals.map((a, i) =>
                  i === pageIndex ? { ...a, status: approved ? 'approved' : 'denied' } : a
                ),
              }
            : m
        )
      );
      const page = messagesRef.current.find((m) => m.id === msgId)?.approvals?.[pageIndex];
      if (!page) return;
      answerInterrupt(
        { requestId: page.requestId, index: page.slotIndex },
        { type: approved ? 'approve' : 'reject' }
      );
    },
    [answerInterrupt, setMessages]
  );

  /**
   * 用户说的话，原样交给 agent。
   *
   * 这里**曾经**有六条关键词路由（`/优化|jd|岗位/` → 优化技能、`/分析/` → 体检、
   * `/面试|模拟/` → 直接弹浮层……）。删掉的理由不是它们不准，是这件事根本不该在这一层做：
   *
   * - 判定在前端、用关键词，且**优先于模型**——模型连原话都看不见。「给我两三个优化方向」
   *   被 `/优化/` 劫进一条要 JD 的流程，而用户压根没提岗位。
   * - 单字规则误伤成片：`/翻/` 吃掉「翻来覆去改了好几遍」，`/日/` 吃掉「6 月 30 日离职」。
   * - `/分析/` 那条连 `text` 都不传，用户说了什么直接丢掉。
   * - 靠调整 if 顺序抢救语义（`匹配` 必须排在 `优化` 前面，否则被 `/岗位/` 吞掉），
   *   已经说明这套判定站不住。
   *
   * 技能选择交给 agent：`engine/skills/` 全部挂载，`AGENTS.md` 教它怎么挑，`ask_choice`
   * 让它在拿不准时问一句。想显式指定的仍走 `/` 菜单（`runSkillWithText`）。
   */
  const handleSend = useCallback(
    (text: string) => {
      setStarted(true);
      // 在乐观插入之前先构造发给后端的历史。
      const history = toBackendHistory(messagesRef.current).concat([{ role: 'user', content: text }]);
      addMessage({ id: nanoid(), role: 'user', content: text });
      // `create` 是显式模式（由 `/` 菜单的创建技能置位），不是关键词猜出来的——留着。
      void runChat(history, chatMode === 'create' ? 'create' : 'general');
    },
    [chatMode, addMessage, runChat, setStarted]
  );

  /**
   * 重答最后一轮。
   *
   * 最后一条用户消息之后的东西全是这一轮的产物——答案、工具追踪、任务卡。重答要把它们
   * **换掉**而不是在下面再堆一份：两份答案并排，用户没法判断哪份是"现在的"，而右侧画布
   * 也只认最后一次运行。
   */
  const handleRegenerate = useCallback(() => {
    const msgs = messagesRef.current;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === 'user') {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const text = msgs[idx].content ?? '';
    if (!text.trim()) return;

    // 连同那条用户消息一起截掉——`handleSend` 会把它重新加回去。
    const truncated = msgs.slice(0, idx);
    setMessages(truncated);
    // `messagesRef` 是在渲染里赋值的，这一拍还是旧值，而 `handleSend` 同步读它拼历史。
    // 提前对齐；下次渲染会再赋一次同样的值，不会漂移。
    messagesRef.current = truncated;
    handleSend(text);
  }, [handleSend, setMessages]);

  /**
   * 对话里直接投一份旧简历 PDF。
   *
   * 结果**不**像导入弹窗那样直接建一条新简历——那条路是盲的、不可逆的。这里落到
   * 既有的草稿条上：右侧能看，用户点「应用到简历」才生效（原则③改动先提案）。
   * 解析器自己拿不准的地方（parse_warnings）如实说出来，不闷掉。
   */
  const handleAttachPdf = useCallback(
    (file: File) => {
      setStarted(true);
      // 文件名带一个附件标记而不是把 emoji 拼进正文：emoji 的字形由系统字体决定，
      // 三个平台三种画风三种基线，而且颜色不受主题控制。渲染层画 SVG。
      addMessage({ id: nanoid(), role: 'user', content: file.name, attachment: true });
      const activityId = nanoid();
      addMessage({
        id: activityId,
        role: 'activity',
        content: t('aiLab.attach.parsing'),
        status: 'running',
      });

      void (async () => {
        const form = new FormData();
        form.append('file', file);
        try {
          let parsed: unknown = null;
          let warnings: string[] = [];
          for await (const ev of streamPdfParse(form)) {
            if (ev.type === 'resume_update') {
              parsed = ev.data ?? (ev.payload as { resume?: unknown } | undefined)?.resume ?? null;
            } else if (ev.type === 'error' || ev.type === 'run_failed') {
              // 「这份 PDF 像是扫描件」这类针对具体文档的解释就在帧的 message 里，
              // 它进 detail 行；标题永远是本地化的码文案。
              throw new Error(errorText(fromSseEvent(ev), t('aiLab.attach.failed')));
            }
          }
          const record = (parsed ?? {}) as Record<string, unknown>;
          if (Array.isArray(record.parse_warnings)) {
            warnings = record.parse_warnings.filter(
              (w): w is string => typeof w === 'string' && Boolean(w.trim()),
            );
          }
          const sections = record.sections;
          if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
            throw new Error(t('aiLab.attach.failed'));
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === activityId
                ? { ...m, content: t('aiLab.attach.parsed'), status: 'done' as const }
                : m,
            ),
          );
          const draft = {
            ...record,
            sectionOrder: coerceSectionOrder(record.sectionOrder),
          } as unknown as Resume;
          setResumeDraft(draft);
          setDraftReady(draft);
          if (warnings.length) {
            upsertWidget(`pdf-warnings:${activityId}`, {
              kind: 'fabrication_notice',
              props: {
                items: warnings,
                title: t('aiLab.attach.warningsTitle'),
                body: t('aiLab.attach.warningsBody'),
              },
            });
          }
        } catch (e) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === activityId
                ? { ...m, content: t('aiLab.attach.failed'), status: 'done' as const }
                : m,
            ),
          );
          toast.error(e instanceof Error ? e.message : t('aiLab.attach.failed'));
        }
      })();
    },
    [addMessage, setMessages, setResumeDraft, setStarted, t, upsertWidget],
  );

  // 用户操作了 GenUI 卡片：标记已处理，再按这类卡的约定把结果送回去。
  const handleWidgetAction = useCallback(
    (widgetId: string, result: WidgetActionResult) => {
      // JD 只经表单进入模型（没有文件上传）。只上报长度分桶，正文是用户的材料。
      if (result.type === 'submit') {
        const jd = (result.values as Record<string, unknown> | undefined)?.jd;
        if (typeof jd === 'string' && jd.trim()) {
          appLifecycle.aiJdUploaded({
            sizeBucket: jd.length < 500 ? 'small' : jd.length < 2000 ? 'medium' : 'large',
          });
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.widget?.widgetId === widgetId
            ? {
                ...m,
                widget: {
                  ...m.widget,
                  status: result.type === 'submit' ? 'submitted' : 'cancelled',
                },
              }
            : m
        )
      );

      const message = messagesRef.current.find((m) => m.widget?.widgetId === widgetId);
      const w = message?.widget;
      // 结果去哪由注册表说了算：续跑暂停的运行 / 当成一条用户消息发出 / 卡片自己消化。
      switch (w ? WIDGETS[w.kind]?.interaction : undefined) {
        case 'client':
          // 就地生效的卡（挑模板之类），已经改过本地状态了，没有东西要回后端。
          return;
        case 'message': {
          if (result.type !== 'submit') return;
          const text = Object.values(result.values ?? {})
            .map((v) => v.trim())
            .filter(Boolean)
            .join('\n');
          if (text) handleSend(text);
          return;
        }
        default: {
          // 恢复暂停的 request_form：提交走 `edit` 把值注入工具参数，取消走 `reject`。
          // （langchain HITL 没有 `respond`，所以提交只能搭 `edit`。）
          const decision: HitlDecision =
            result.type === 'submit'
              ? {
                  type: 'edit',
                  editedAction: {
                    // 报真实工具名：卡的 kind 可能是按参数路由出来的别名
                    // （ask_choice_recommended），拿它去续跑会指向一个不存在的工具。
                    name: w?.toolName ?? w?.kind ?? 'request_form',
                    args: { ...(w?.props ?? {}), values: result.values ?? {} },
                  },
                }
              : // 取消一张采集卡是「跳过这一步」，不是终止整个流程——措辞要让模型接着往下走。
                // 同样是发给模型的，用英文（见上面「问答」模式那条的理由）。
                {
                  type: 'reject',
                  message: 'The user skipped this step. Continue with the next one.',
                };
          answerInterrupt(message?.interruptSlot, decision);
        }
      }
    },
    [answerInterrupt, handleSend, setMessages]
  );

  // `/` 菜单选中的技能只是个 chip，不立即执行：用户补充文字后回车才到这里。
  // 文字映射到该技能的主参数（translate→目标语言，optimize→JD），留空则用技能自己的默认值。
  const runSkillWithText = useCallback(
    (id: SkillId, text: string) => {
      const skill = SKILLS[id];
      setStarted(true);
      const t = text.trim();

      // 所有技能都从这一个入口进，起始上报集中在此；后续哪次失败靠 activeSkillRef 认领。
      activeSkillRef.current = id;
      reportSkillStarted(id);

      if (skill.surface === 'immersive') {
        interviewStartedAtRef.current = Date.now();
        setOverlayOpen(true);
        return;
      }

      // 内容技能走会话式：有文字就作为本轮，没文字就发一句自然意图让 AI 用 FormCard 追问。
      if (id === 'fit') {
        const msg = t || SKILL_INTENT.fit!();
        addMessage({ id: nanoid(), role: 'user', content: msg, skillId: id });
        void runFit(msg);
        return;
      }

      if (id === 'translate' || id === 'optimize') {
        const msg = t || SKILL_INTENT[id]!();
        addMessage({ id: nanoid(), role: 'user', content: msg, skillId: id });
        void runContentSkill(id, msg);
        return;
      }

      const display = t || skill.buildIntent({});
      // Tag the turn with the skill so the bubble shows which skill ran.
      addMessage({ id: nanoid(), role: 'user', content: display, skillId: id });

      if (skill.isChat) {
        setChatMode('create');
        // 创建流的舞台就是实时画布本身：草稿在同一张纸上长出来，落地后无缝接管。
        setCanvas(CLOSED_CANVAS);
        setLivingOpen(true);
        void runChat(
          toBackendHistory(messagesRef.current).concat([{ role: 'user', content: display }]),
          'create',
        );
        return;
      }

      // analyze 不吃自由输入：文字只作为本轮显示，跑的仍是标准分析。
      void runAnalyze();
    },
    [addMessage, runChat, runContentSkill, runAnalyze, runFit, setCanvas, setChatMode, setLivingOpen, setStarted],
  );

  // 画布片段经「询问 Polaris」以引用形式抬进输入框。
  const onAskWithTarget = useCallback(
    (ctx: { path: string; label: string; text: string; selectionText?: string }) => {
      setStarted(true);
      setLivingOpen(true);
      setQuoted({
        path: ctx.path,
        label: ctx.label,
        text: ctx.text.slice(0, 400),
        selectionText: ctx.selectionText,
      });
    },
    [setLivingOpen, setStarted]
  );

  // 限定在片段上的会话式一轮：走主对话（模型可以反问），但标记为 batch，
  // 让 resume_update 变成画布上的就地提案。故意用 `mode: 'general'` 而非 optimize
  // 技能——后者会读整篇简历并索要 JD，而 Polaris 只改这个片段。
  const runTargetedEdit = useCallback(
    async (message: string, targetedSelection?: TargetedSelectionDiff) => {
      const pending: PendingRun = {
        kind: 'chat',
        history: [{ role: 'user', content: message }],
        mode: 'general',
      };
      const config = await resolveRunConfig(pending);
      if (!config) return;
      skillBatchRunRef.current = { kind: 'optimize', targetedSelection }; // route resume_update → living canvas
      markSessionUsed();
      void consumeStream(
        (signal) =>
          streamChat({
            messages: [{ role: 'user', content: message }],
            agentMode: agentModeRef.current,
            mode: 'general',
            sessionId: sessionIdRef.current,
            resumeId: scopedResumeId(),
            config,
            signal,
          }),
        pending,
      );
    },
    [consumeStream, resolveRunConfig, markSessionUsed, scopedResumeId],
  );

  // 「询问 Polaris」发送：留一条带引用的旁白用户消息，再把指令作为会话轮次跑，改动回到画布上。
  const sendTargetedEdit = useCallback(
    (instruction: string) => {
      if (!quoted) return;
      const instr = instruction.trim();
      addMessage({
        id: nanoid(),
        role: 'user',
        content: instr || '优化这一段',
        quote: { label: quoted.label, text: quoted.text },
      });

      const message = [
        '请只改写简历中下面这一处选中的片段，其它内容保持不变。',
        `位置：${quoted.path}`,
        `选中片段：「${quoted.selectionText ?? quoted.text}」`,
        instr ? `要求：${instr}` : '要求：优化这段表达，使其更专业、更有力。',
      ].join('\n');
      const targetedSelection = quoted.selectionText
        ? { path: quoted.path, selectionText: quoted.selectionText }
        : undefined;
      setQuoted(null);
      void runTargetedEdit(message, targetedSelection);
    },
    [quoted, addMessage, runTargetedEdit],
  );

  // Replay the action the user attempted before the config gate intercepted it.
  const continuePendingRun = useCallback(() => {
    const pending = pendingRunRef.current;
    pendingRunRef.current = null;
    setConfigGateOpen(false);
    if (!pending) return;
    if (pending.kind === 'analyze') void runAnalyze();
    else if (pending.kind === 'content') void runContentSkill(pending.skill, pending.message);
    else void runChat(pending.history, pending.mode);
  }, [runAnalyze, runContentSkill, runChat]);

  // Gate "保存并继续": persist the key (survives reload) then resume the stashed run.
  const handleGateContinue = useCallback(async () => {
    await saveSettings();
    continuePendingRun();
  }, [saveSettings, continuePendingRun]);

  const toggleCanvas = useCallback(
    (id: SkillId) => {
      // 重跑 optimize/translate 需要参数（JD / 语言），所以这个开关只显示/隐藏上次结果的画布。
      if (isBatchSkill(id)) {
        setLivingOpen((open) => {
          if (open) canvasDismissedForRun.current = true;
          return !open;
        });
        return;
      }
      setLivingOpen(false);
      setCanvas((prev) => {
        if (prev.open && prev.skillId === id) return { ...prev, open: false };
        const sk = SKILLS[id];
        if (!sk.canvas) return prev;
        return {
          open: true,
          skillId: id,
          view: sk.canvas.defaultView,
          status: prev.skillId === id ? prev.status : 'ready',
        };
      });
    },
    [setCanvas, setLivingOpen]
  );

  const resetSession = useCallback(() => {
    runGenRef.current += 1; // invalidate the in-flight run's lingering callbacks
    controllerRef.current?.abort(); // stop the old session's in-flight stream
    const oldSessionId = sessionIdRef.current;
    if (sessionUsedRef.current && oldSessionId) void endSessionThread(oldSessionId); // reclaim old session
    const nextSession = resetAiSession(resumeId);
    sessionIdRef.current = nextSession.sessionId;
    sessionUsedRef.current = false;
    reportInterviewEnded();
    setOverlayOpen(false);
    setAwaitingReply(false);
    setDraftReady(null);
    // 运行态必须在这里自己收掉。consumeStream 的 finally 裹着 `if (isCurrent())`
    // ——那道守卫是防「被顶替的旧运行关掉新运行的转圈」，但上面刚把 generation 抬走，
    // isCurrent() 已经是 false，清理块整个被跳过；而重置又没有新运行来接手，
    // 于是 running 永远停在 true：回到欢迎态了，发送键还是停止键。
    setRunning(false);
    setIsAiJobRunning(false);
    setActivity(null);
    controllerRef.current = null;
  }, [resetAiSession, resumeId, reportInterviewEnded, setIsAiJobRunning]);

  const requestResetSession = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);


  const stopRun = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  /** 真正执行关闭：中止在飞行的流，再把面板收起。 */
  const doClose = useCallback(() => {
    controllerRef.current?.abort();
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    // 运行中关闭会中止流，二次确认只是防手滑。走项目自己的 ConfirmDialog 而不是
    // window.confirm：后者是系统弹窗，样式不可控、带 "localhost:3000 显示" 的抬头，
    // 而且**同步阻塞**——在流式渲染期间卡住主线程。
    if (running) {
      setCloseConfirmOpen(true);
      return;
    }
    doClose();
  }, [running, doClose]);

  const applyDraft = useCallback(() => {
    if (!draftReady) return;
    onApplyFullResume(draftReady);
    setDraftReady(null);
    addAssistant(t('aiLab.draft.applied'));
  }, [draftReady, onApplyFullResume, addAssistant, t]);

  /**
   * 不用这份草稿。
   *
   * 原则 3：「AI 是合作者不是推土机——改动先提案、**可拒绝**、有理由」。此前这张卡
   * 只有"应用"一个出口，在你点它之前一直挂着——那不是提案，是通知。
   *
   * 清掉 `draftReady` 就同时收走了右侧预览（预览直接绑在这个 state 上），简历一个
   * 字都不写。然后主动问一句把话头交回输入框：要的是「可拒绝、有理由」，所以给出
   * 说理由的**邀请**，而不是设一道必答题（Anti-reference：冗长问卷）。
   */
  const discardDraft = useCallback(() => {
    if (!draftReady) return;
    setDraftReady(null);
    addAssistant(t('aiLab.draft.discarded'));
  }, [draftReady, addAssistant, t]);

  const composer = (
    <>
      {configGateOpen && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto rounded-2xl border border-sky-500/30 bg-neutral-900/90 backdrop-blur px-4 py-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
                <KeyRound size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t('aiLab.configGate.title')}</p>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                  {t('aiLab.configGate.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfigGateOpen(false)}
                aria-label="关闭"
                className="ml-auto text-neutral-500 hover:text-white transition-colors shrink-0 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <ModelConfigFields />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfigGateOpen(false)}
                className="px-4 py-2 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                {t('aiLab.configGate.later')}
              </button>
              <button
                type="button"
                onClick={handleGateContinue}
                disabled={!hasLlmConfig()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-500 text-[#fff] hover:bg-sky-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('aiLab.configGate.saveAndContinue')}
              </button>
            </div>
          </div>
        </div>
      )}
      {draftReady && (
        <div className="px-4 pb-2">
          <div className="max-w-3xl mx-auto flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200">
            <FileText size={14} className="text-sky-400 shrink-0" />
            <span className="flex-1">{t('aiLab.draft.ready')}</span>
            {/* 两个动作归在右端。拒绝走 ghost、不用红色：这不是危险操作，是一个平等的
                选项——简历一个字都不会被改。也不弹确认框（无损，且 modals are lazy）。 */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={discardDraft}
                className="rounded-lg px-3 py-1.5 text-sky-200/70 transition-colors hover:bg-sky-500/10 hover:text-sky-100 cursor-pointer"
              >
                {t('aiLab.draft.discard')}
              </button>
              <button
                type="button"
                onClick={applyDraft}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 px-3 py-1.5 text-sky-100 transition-colors cursor-pointer"
              >
                <Check size={12} />
                {t('aiLab.draft.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
      <Composer
        onRunSkill={runSkillWithText}
        onSend={handleSend}
        quotedContext={quoted ? { label: quoted.label, text: quoted.text } : null}
        onSendWithContext={sendTargetedEdit}
        onClearQuoted={() => setQuoted(null)}
        disabled={running}
        running={running}
        onStop={stopRun}
        onAttachPdf={handleAttachPdf}
        mode={agentMode}
        onModeChange={setAgentMode}
        conversationStarted={started}
      />
    </>
  );

  return (
    // 搜索类卡片的候选数据从这里注入：字典留在 app（是我们的业务内容），
    // 组件库只知道「按名字要一份选项」。
    <GenUIProvider sources={AI_WIDGET_SOURCES}>
    <div className="relative flex flex-col h-full">
      <header className="flex items-center gap-3 px-5 py-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-sky-500/15 to-sky-500/[0.04] border border-sky-500/25 flex items-center justify-center text-sky-300">
          <LabMark size={19} />
        </div>
        <span className="text-base font-semibold text-white tracking-tight">{t('aiLab.header.title')}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400 border border-neutral-800 rounded-full px-2.5 py-1">
          <FileText size={12} />
          {resumeData.name || '未命名简历'}
        </span>
        <div className="ml-auto flex items-center gap-3 text-neutral-500">
          <HeaderQuota />
          <button
            type="button"
            onClick={toggleLiving}
            aria-label={t('aiLab.header.liveCanvas')}
            title={t('aiLab.header.liveCanvasTitle')}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border transition-colors cursor-pointer',
              livingOpen
                ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
                : 'text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
            )}
          >
            <PencilRuler size={13} />
            {t('aiLab.header.liveCanvas')}
          </button>
          <button
            type="button"
            onClick={requestResetSession}
            aria-label={t('aiLab.header.newChat')}
            title={t('aiLab.header.newChat')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            <SquarePen size={17} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="hover:text-white transition-colors cursor-pointer active:scale-90"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <ConfirmDialog
        isOpen={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={() => {
          setCloseConfirmOpen(false);
          doClose();
        }}
        title={t('aiLab.closeConfirm.title')}
        description={t('aiLab.closeConfirm.description')}
        confirmText={t('aiLab.closeConfirm.confirm')}
        cancelText={t('common.cancel')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={resetSession}
        title={t('aiLab.reset.title')}
        description={
          running
            ? t('aiLab.reset.descriptionRunning')
            : t('aiLab.reset.descriptionIdle')
        }
        confirmText={t('aiLab.reset.confirm')}
        cancelText={t('common.cancel')}
        variant="danger"
      />

      <div className="flex-1 flex min-h-0">
        <div className={cn('relative flex-1 flex flex-col min-w-0 overflow-hidden', !started && 'justify-center')}>
          <AnimatePresence initial={false} mode="popLayout">
            {!started ? (
              <motion.div
                key="greeting"
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
                }}
                className="flex flex-col items-center text-center px-4"
              >
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 10, scale: 0.92 },
                    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: 'easeOut' } },
                  }}
                  className="mb-5"
                >
                  {/* 转场起点：发出第一句话后，这只宠会跳到输入框上方的工位去。
                      它在卸载前把自己的位置留给工位（见 polarisFlight），工位挂载时
                      取走算位移——两端不在同一帧共存，只能这样交接。 */}
                  <div
                    ref={(el) => {
                      if (!el) return;
                      const box = el.getBoundingClientRect();
                      setFlightOrigin({
                        x: box.left + box.width / 2,
                        y: box.top + box.height / 2,
                        size: box.width,
                      });
                    }}
                  >
                    <PolarisAvatar />
                  </div>
                </motion.div>
                <motion.h2
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
                  }}
                  className="text-2xl font-semibold text-white tracking-tight"
                >
                  {t('aiLab.greeting.title')}
                </motion.h2>
              </motion.div>
            ) : (
              <motion.div
                key="thread"
                className="flex-1 min-h-0 flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.12 }}
              >
                <ChatThread
                  messages={messages}
                  onToggleCanvas={toggleCanvas}
                  onLogClick={focusOnCanvas}
                  onApproval={handleApproval}
                  onWidgetAction={handleWidgetAction}
                  thinking={awaitingReply}
                  activity={activity}
                  onRegenerate={handleRegenerate}
                  openCanvasSkillId={
                    canvas.open ? canvas.skillId : livingOpen ? livingSkillId : null
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>

          {started && (
            <PolarisPerch />
          )}

          <motion.div
            layout="position"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative"
          >
            {composer}
          </motion.div>

          <AnimatePresence mode="popLayout">
            {!started && (
              <motion.div
                key="cards"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, delay: 0.05 }}
                className="mt-1"
              >
                <WelcomeSuggestions onPrompt={handleSend} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 右舞台只有一块。
            此前实时画布和报告画布是两个各自动画宽度的兄弟节点：切换时一个 58%→0、
            另一个 0→44% **同时**跑，而且分属 framer-motion 与 CSS transition 两套系统、
            曲线时长都不同。重叠期间两者宽度之和会超过 100%，中间的对话列被挤到 0 再
            弹回来——那就是「先开画布再开评分」时看到的闪烁。
            现在宽度只由这一层动一次（0 ↔ 58% ↔ 44%），里面的内容做交叉淡入。 */}
        <motion.div
          className="shrink-0 min-w-0 overflow-hidden"
          initial={false}
          animate={{ width: livingOpen ? '58%' : canvas.open ? '44%' : '0%' }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {livingOpen ? (
              <motion.div
                key="living-canvas"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <LivingCanvas
                  resumeData={resumeData}
                  templateId={templateId}
                  onApplySections={onApplySections}
                  onApplyInfo={onApplyInfo}
                  onLog={logChange}
                  onWarn={warnDropped}
                  onAskWithTarget={onAskWithTarget}
                  batchRequest={batchRequest}
                  focusRequest={focusRequest}
                  previewResume={draftReady}
                  working={chatMode === 'create' && running && !draftReady}
                />
              </motion.div>
            ) : canvas.open ? (
              <motion.div
                key="artifact-canvas"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <ArtifactCanvas
                  state={canvas}
                  resumeData={resumeData}
                  templateId={templateId}
                  analysis={analysis}
                  fitReport={fitReport}
                  onDiscard={() => setCanvas(CLOSED_CANVAS)}
                  onFollowUp={handleSend}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

      <InterviewOverlay open={overlayOpen} onBack={() => setOverlayOpen(false)} />
    </div>
    </GenUIProvider>
  );
}

/** 顶部胶囊：点开显示内置额度余量。仅云端——BYOK 用的是用户自己的 key，没有内置额度可显示。 */
function HeaderQuota() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // 懒加载：面板打开才请求 /ai-entitlement（客户端有缓存）。
  const { data, loading, error } = useEntitlement(open);
  if (!isCloudMode) return null;

  const locale = i18n.language.startsWith('en') ? 'en-US' : 'zh-CN';
  const fmtReset = (d?: string | null) =>
    d
      ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
      : '';
  // 月度余量只以百分比下发（积分是内部计费单位，客户端拿不到原始余额）。null = 无限。
  const credit = data
    ? { percent: data.remainingPercent, resetAt: data.resetAt ?? null }
    : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('aiLab.header.quotaTitle')}
        title={t('aiLab.header.quotaTitle')}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border transition-colors cursor-pointer',
          open
            ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
            : 'text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
        )}
      >
        <Gauge size={13} />
        {t('aiLab.header.quota')}
      </button>
      <AnimatePresence>
        {open && (
          <React.Fragment key="quota-popover">
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/10 bg-neutral-900 p-3.5 shadow-2xl"
            >
              {!data && loading ? (
                <div className="space-y-2">
                  <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                </div>
              ) : !data ? (
                <p className="text-xs text-neutral-500">{error || t('aiLab.header.quotaUnavailable')}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-neutral-500">{t('account.subscription.currentPlan')}</span>
                    <span className="inline-flex h-5 items-center rounded-md border border-sky-400/25 bg-sky-400/10 px-1.5 text-[11px] font-semibold text-sky-300">
                      {data.currentPlan?.name ?? '—'}
                    </span>
                  </div>
                  {credit && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="text-neutral-400">{t('account.subscription.monthly')}</span>
                        <span className="tabular-nums text-neutral-300">
                          {credit.percent === null ? t('account.subscription.unlimited') : `${credit.percent}%`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400', credit.percent === null && 'opacity-60')}
                          style={{ width: `${credit.percent === null ? 100 : Math.max(0, Math.min(100, credit.percent))}%` }}
                        />
                      </div>
                      {credit.resetAt && (
                        <div className="mt-1 text-[10px] text-neutral-600">
                          {t('account.subscription.resetAt', { time: fmtReset(credit.resetAt) })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>
    </div>
  );
}
