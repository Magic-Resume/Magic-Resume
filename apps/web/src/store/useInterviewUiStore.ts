import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** 面试风格，与后端 `start_interview` 工具的 schema 对齐。 */
export type InterviewStyle = 'standard' | 'pressure' | 'behavioral';
/** 面试语言。**由 agent 问出来**，不从聊天语言推断——中文聊天练英文面试很常见。 */
export type InterviewLanguage = 'zh' | 'en';
/** 难度：问多深。与 style（怎么问）正交。 */
export type InterviewDifficulty = 'entry' | 'standard' | 'hard';

/** agent 建议的这一场面试打算怎么面。会话由用户选定模式时才真正创建。 */
export interface InterviewBrief {
  role: string;
  jobDescription?: string;
  durationMinutes: number;
  style: InterviewStyle;
  language: InterviewLanguage;
  difficulty: InterviewDifficulty;
}

/** 从编辑器交接给面试页的一整包启动参数。 */
export interface InterviewLaunch {
  brief: InterviewBrief;
  /**
   * 由编辑器用 `buildResumeContext(resumeData)` 算好带过来。
   *
   * **面试页在编辑器之外，拿不到当前简历**——它不知道用户在编辑哪一份。会话一旦
   * 创建，这段上下文就存进服务端会话里了，之后恢复现场不再需要它。
   */
  resumeContext: string;
}

interface InterviewUiState {
  launch: InterviewLaunch | null;
  /**
   * 面试结束/离开时回哪儿。
   *
   * 与 `launch` **分开存**：`launch` 在会话建好那一刻就消费掉了，而这个要一直活到用户
   * 真的离开——否则退出面试会掉到简历列表，而不是他进来时那份简历的编辑器。
   */
  returnTo: string | null;
  setLaunch: (launch: InterviewLaunch, returnTo: string) => void;
  clearLaunch: () => void;
  clearReturnTo: () => void;
}

/**
 * 编辑器 → 面试页的启动交接。
 *
 * 要交接的是「这一场怎么面 + 基于哪份简历」，而且要能扛住一次刷新——用户在选择模式那一屏
 * 刷新是很自然的动作，丢了就只能回编辑器重来。
 *
 * **持久化用 sessionStorage 而不是 IndexedDB/localStorage**：这是一次性的交接，
 * 跨标签页或者明天再打开都不该看到它。会话真正开始后 URL 里有 sessionId，
 * 恢复现场走服务端，不再依赖这份。
 */
export const useInterviewUiStore = create<InterviewUiState>()(
  persist(
    (set) => ({
      launch: null,
      returnTo: null,
      setLaunch: (launch, returnTo) => set({ launch, returnTo }),
      clearLaunch: () => set({ launch: null }),
      clearReturnTo: () => set({ returnTo: null }),
    }),
    {
      name: 'magic-interview-launch',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? undefined! : window.sessionStorage,
      ),
    },
  ),
);
