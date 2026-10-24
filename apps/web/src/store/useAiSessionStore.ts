import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { nanoid } from 'nanoid';
import { dbClient } from '../lib/api/IndexDBClient';
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

export const AI_SESSION_STORAGE_PREFIX = 'ai-session:';

const CLOSED_CANVAS: CanvasState = {
  open: false,
  skillId: null,
  view: 'preview',
  status: 'idle',
};

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
  updatedAt: number;
}

type AiSessionPatch = Partial<Omit<AiSessionSnapshot, 'updatedAt'>>;

interface AiSessionDb {
  setItem<T>(key: string, value: T): Promise<void>;
  getItem<T>(key: string): Promise<T | null>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<string[]>;
}

interface CreateAiSessionStoreOptions {
  db?: AiSessionDb;
  now?: () => number;
  idFactory?: () => string;
  persistDelayMs?: number;
}

export interface AiSessionState {
  sessions: Record<string, AiSessionSnapshot>;
  ensureSession: (resumeId: string) => AiSessionSnapshot;
  /** Read this resume's conversation from IndexedDB (a fresh one when none is saved). */
  loadSession: (resumeId: string) => Promise<AiSessionSnapshot>;
  patchSession: (resumeId: string, patch: AiSessionPatch) => AiSessionSnapshot;
  resetSession: (resumeId: string) => AiSessionSnapshot;
  /** Replace the whole snapshot, e.g. when regenerating continues from a trimmed history. */
  adoptSession: (
    resumeId: string,
    session: AiSessionSnapshot,
  ) => AiSessionSnapshot;
  flushSession: (resumeId: string) => Promise<void>;
}

export function getAiSessionStorageKey(resumeId: string): string {
  return `${AI_SESSION_STORAGE_PREFIX}${resumeId}`;
}

function normalizeSession(
  saved: Partial<AiSessionSnapshot> | null | undefined,
  fallback: AiSessionSnapshot,
): AiSessionSnapshot {
  return {
    ...fallback,
    ...saved,
    messages: Array.isArray(saved?.messages)
      ? saved.messages
      : fallback.messages,
    canvas: saved?.canvas
      ? { ...fallback.canvas, ...saved.canvas }
      : fallback.canvas,
  };
}

export function createAiSessionStore(
  options: CreateAiSessionStoreOptions = {},
): UseBoundStore<StoreApi<AiSessionState>> {
  const db: AiSessionDb = options.db ?? dbClient;
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? nanoid;
  const persistDelayMs = options.persistDelayMs ?? 350;
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
    updatedAt: now(),
  });

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
        if (existing) return existing;
        const session = createEmptySession();
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        return session;
      },

      loadSession: async (resumeId) => {
        const cached = get().sessions[resumeId];
        if (cached) return cached;

        const saved = await db.getItem<Partial<AiSessionSnapshot>>(
          getAiSessionStorageKey(resumeId),
        );
        const current = get().sessions[resumeId];
        if (current) return current;
        const session = normalizeSession(saved, createEmptySession());
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        return session;
      },

      patchSession: (resumeId, patch) => {
        const previous = get().sessions[resumeId] ?? createEmptySession();
        const session = { ...previous, ...patch, updatedAt: now() };
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        // Text deltas stay in the component overlay. Persist committed messages
        // immediately so a quick reload cannot lose a completed turn.
        if (patch.messages) void get().flushSession(resumeId);
        else scheduleWrite(resumeId);
        return session;
      },

      adoptSession: (resumeId, session) => {
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        void get().flushSession(resumeId);
        return session;
      },

      resetSession: (resumeId) => {
        const session = createEmptySession();
        set((state) => ({
          sessions: { ...state.sessions, [resumeId]: session },
        }));
        void get().flushSession(resumeId);
        return session;
      },

      flushSession: async (resumeId) => {
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
