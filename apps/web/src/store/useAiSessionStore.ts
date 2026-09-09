import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { nanoid } from 'nanoid';
import { dbClient } from '../lib/api/IndexDBClient';
import { enqueueMessage } from '../lib/api/conversationSync';
import type {
  CanvasState,
  ChatMessage,
  SkillId,
} from '../app/dashboard/edit/_components/ai/types';
import type { MultiPersonaResumeAnalysis } from '../types/agent/multi-persona';
import type { FitReport } from '../types/agent/fit-report';
import {
  DEFAULT_AGENT_MODE,
  type AgentMode,
} from '../app/dashboard/edit/_components/ai/conversation/modes';

export const AI_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AI_SESSION_STORAGE_PREFIX = 'ai-session:';

const CLOSED_CANVAS: CanvasState = { open: false, skillId: null, view: 'preview', status: 'idle' };

export type AiSessionChatMode = 'idle' | 'create';

export interface AiSessionSnapshot {
  sessionId: string;
  sessionUsed: boolean;
  started: boolean;
  messages: ChatMessage[];
  chatMode: AiSessionChatMode;
  /**
   * 输入框的模式（共创 / 规划 / 问答）——与技能正交的一根轴，决定 AI 能不能改、
   * 要不要读这份简历。持久化进会话:关掉面板再打开，用户上次选的边界应该还在，
   * 否则「我明明设成了不许改简历」会在重开后悄悄失效。
   */
  agentMode: AgentMode;
  canvas: CanvasState;
  livingOpen: boolean;
  livingSkillId: SkillId | null;
  analysis: MultiPersonaResumeAnalysis | null;
  fitReport: FitReport | null;
  /**
   * 已经投递给服务端的消息条数。
   *
   * 与会话一起持久化：不然刷新后会把整条时间线重投一遍——服务端幂等所以不会写坏，
   * 但那是几十个白打的请求。`resetSession` 换新 sessionId 时它自然归零。
   */
  syncedCount: number;
  updatedAt: number;
}

type AiSessionPatch = Partial<Omit<AiSessionSnapshot, 'updatedAt'>>;

interface AiSessionDb {
  setItem<T>(key: string, value: T): Promise<void>;
  getItem<T>(key: string): Promise<T | null>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<string[]>;
}

/**
 * 把一条已定稿的消息投给服务端。
 *
 * 做成端口是为了测试能注入一个不打网络的实现——store 的单测跑在 jsdom 里，
 * 真去发请求会让它变慢且不稳定。
 */
export interface ConversationSyncPort {
  push(input: {
    conversationId: string;
    resumeId: string;
    /** 会话标题。取自首轮提问，建会话时用一次；**不用模型现算**，那要钱也要等。 */
    title?: string;
    seq: number;
    role: string;
    content?: string;
    payload?: Record<string, unknown>;
  }): void;
}

const defaultSync: ConversationSyncPort = {
  push: (input) => void enqueueMessage(input),
};

interface CreateAiSessionStoreOptions {
  db?: AiSessionDb;
  now?: () => number;
  idFactory?: () => string;
  persistDelayMs?: number;
  sync?: ConversationSyncPort;
}

export interface AiSessionState {
  sessions: Record<string, AiSessionSnapshot>;
  ensureSession: (resumeId: string) => AiSessionSnapshot;
  loadSession: (resumeId: string) => Promise<AiSessionSnapshot>;
  patchSession: (resumeId: string, patch: AiSessionPatch) => AiSessionSnapshot;
  resetSession: (resumeId: string) => AiSessionSnapshot;
  /** 把这条会话里还没投递的消息推给服务端。在一轮跑完时调用——**那才是时间线不再变的时刻**。 */
  sealSession: (resumeId: string) => void;
  /** 从云端历史切过来。整份快照替换，`syncedCount` 置满：这些消息服务端本来就有。 */
  adoptSession: (resumeId: string, session: AiSessionSnapshot) => AiSessionSnapshot;
  deleteExpiredSessions: () => Promise<void>;
  flushSession: (resumeId: string) => Promise<void>;
}

export function getAiSessionStorageKey(resumeId: string): string {
  return `${AI_SESSION_STORAGE_PREFIX}${resumeId}`;
}

/** 会话标题最多这么长——它要在一行里读完，多出来的部分只会被截断。 */
const TITLE_MAX = 30;

/**
 * 从首轮提问提炼标题。
 *
 * 用第一句用户说的话，不用模型：标题只是让人在列表里认出「哪一场」，为此调一次模型
 * 既要钱又要等。取不到就回 undefined，让服务端保持空标题，UI 显示「新对话」。
 */
export function conversationTitle(messages: ChatMessage[]): string | undefined {
  const first = messages.find(
    (m) => m.role === 'user' && (m.content ?? '').trim(),
  );
  const text = first?.content?.trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text;
}

function normalizeSession(
  saved: Partial<AiSessionSnapshot> | null | undefined,
  fallback: AiSessionSnapshot
): AiSessionSnapshot {
  return {
    ...fallback,
    ...saved,
    messages: Array.isArray(saved?.messages) ? saved.messages : fallback.messages,
    canvas: saved?.canvas ? { ...fallback.canvas, ...saved.canvas } : fallback.canvas,
  };
}

export function createAiSessionStore(
  options: CreateAiSessionStoreOptions = {}
): UseBoundStore<StoreApi<AiSessionState>> {
  const db: AiSessionDb = options.db ?? dbClient;
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? nanoid;
  const persistDelayMs = options.persistDelayMs ?? 350;
  const sync = options.sync ?? defaultSync;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const createEmptySession = (): AiSessionSnapshot => ({
    sessionId: idFactory(),
    sessionUsed: false,
    started: false,
    messages: [],
    chatMode: 'idle',
    agentMode: DEFAULT_AGENT_MODE,
    canvas: CLOSED_CANVAS,
    livingOpen: false,
    livingSkillId: null,
    analysis: null,
    fitReport: null,
    syncedCount: 0,
    updatedAt: now(),
  });

  const isExpired = (session: AiSessionSnapshot): boolean =>
    now() - session.updatedAt > AI_SESSION_TTL_MS;

  return create<AiSessionState>((set, get) => {
    const writeSession = async (resumeId: string): Promise<void> => {
      const session = get().sessions[resumeId];
      if (!session) return;
      await db.setItem(getAiSessionStorageKey(resumeId), session);
    };

    const scheduleWrite = (resumeId: string) => {
      const existing = timers.get(resumeId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.delete(resumeId);
        void writeSession(resumeId);
      }, persistDelayMs);
      timers.set(resumeId, timer);
    };

    return {
      sessions: {},

      ensureSession: (resumeId) => {
        const existing = get().sessions[resumeId];
        if (existing && !isExpired(existing)) return existing;
        const session = createEmptySession();
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        return session;
      },

      loadSession: async (resumeId) => {
        const cached = get().sessions[resumeId];
        if (cached && !isExpired(cached)) return cached;

        const fallback = createEmptySession();
        const saved = await db.getItem<Partial<AiSessionSnapshot>>(getAiSessionStorageKey(resumeId));
        const current = get().sessions[resumeId];
        if (current && !isExpired(current)) return current;
        const session = normalizeSession(saved, fallback);

        if (saved && isExpired(session)) {
          await db.removeItem(getAiSessionStorageKey(resumeId));
          set((state) => ({
            sessions: { ...state.sessions, [resumeId]: fallback },
          }));
          return fallback;
        }

        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        return session;
      },

      patchSession: (resumeId, patch) => {
        const session = {
          ...(get().sessions[resumeId] ?? createEmptySession()),
          ...patch,
          updatedAt: now(),
        };
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        scheduleWrite(resumeId);
        return session;
      },

      sealSession: (resumeId) => {
        const session = get().sessions[resumeId];
        if (!session) return;
        const title = conversationTitle(session.messages);
        // 下标即 seq。时间线只增不删，所以下标在同一条会话里是稳定的；从 syncedCount
        // 起投是为了少打请求，而不是为了正确性——重投也只会覆盖同一行。
        for (let seq = session.syncedCount; seq < session.messages.length; seq++) {
          const message = session.messages[seq];
          const { role, content, ...rest } = message;
          sync.push({
            conversationId: session.sessionId,
            resumeId,
            title,
            seq,
            role,
            content,
            // 除 content 外的一切（审批、todo、工具、时间线分段）原样带走：这些卡片
            // 就是对话本身，只存正文等于把历史读成一串没有上下文的白话。
            payload: rest as Record<string, unknown>,
          });
        }
        if (session.syncedCount === session.messages.length) return;
        set((state) => ({
          sessions: {
            ...state.sessions,
            [resumeId]: { ...session, syncedCount: session.messages.length },
          },
        }));
        scheduleWrite(resumeId);
      },

      adoptSession: (resumeId, session) => {
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        scheduleWrite(resumeId);
        return session;
      },

      resetSession: (resumeId) => {
        // 先把上一场收干净再换 id——换完就再也找不到它是哪条会话的消息了。
        get().sealSession(resumeId);
        const session = createEmptySession();
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        scheduleWrite(resumeId);
        return session;
      },

      deleteExpiredSessions: async () => {
        const keys = db.getAllKeys ? await db.getAllKeys() : [];
        for (const key of keys) {
          if (!key.startsWith(AI_SESSION_STORAGE_PREFIX)) continue;
          const saved = await db.getItem<Partial<AiSessionSnapshot>>(key);
          const session = normalizeSession(saved, createEmptySession());
          if (saved && isExpired(session)) await db.removeItem(key);
        }

        const expiredIds = Object.entries(get().sessions)
          .filter(([, session]) => isExpired(session))
          .map(([resumeId]) => resumeId);

        if (expiredIds.length > 0) {
          set((state) => {
            const sessions = { ...state.sessions };
            for (const resumeId of expiredIds) delete sessions[resumeId];
            return { sessions };
          });
          // Clear any pending debounced write for a pruned session so a stale timer
          // can't fire (and leak) after the session is gone.
          for (const resumeId of expiredIds) {
            const timer = timers.get(resumeId);
            if (timer) {
              clearTimeout(timer);
              timers.delete(resumeId);
            }
          }
        }
      },

      flushSession: async (resumeId) => {
        // 离开面板也是一个「时间线不再变」的时刻，顺手把尾巴收掉。
        get().sealSession(resumeId);
        const existing = timers.get(resumeId);
        if (existing) {
          clearTimeout(existing);
          timers.delete(resumeId);
        }
        await writeSession(resumeId);
      },
    };
  });
}

export const useAiSessionStore = createAiSessionStore();
