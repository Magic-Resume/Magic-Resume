import { httpClient, type ApiResponse } from './httpClient';
import { AGENT_ROUTES } from './routes';

/** 与 Prisma 的 `MemoryKind` 一一对应。 */
export type MemoryKind = 'profile' | 'signal' | 'pref';

export interface MemoryEntry {
  key: string;
  kind: MemoryKind;
  fact: string;
  /** 抽取那一刻有多确信。此后不变。 */
  confidence: number;
  /**
   * 衰减后的当前分量。低于 0.25 的不再进 prompt（AI「想不起来」了），
   * 但仍然列在这里——用户要能看到它正在被忘掉，也还来得及纠正。
   */
  effective: number;
  confirmCount: number;
  lastConfirmedAt: string;
  /** 溯源：哪一场面试/对话。**可点回去看证据**是判断「这条记错没有」的唯一依据。 */
  source: { kind: 'conversation' | 'interview'; id: string; at: string };
  updatedAt: string;
}

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

export const memoryApi = {
  async list(): Promise<MemoryEntry[]> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<MemoryEntry[]>>(
        AGENT_ROUTES.memory.list,
      ),
    );
  },

  async forget(kind: MemoryKind, key: string): Promise<void> {
    await httpClient.agent.delete(AGENT_ROUTES.memory.forget(kind, key));
  },

  async getSettings(): Promise<{ enabled: boolean }> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<{ enabled: boolean }>>(
        AGENT_ROUTES.memory.settings,
      ),
    );
  },

  /** 关掉 = 停止抽取 + 停止注入，**不删已有的**。 */
  async setEnabled(enabled: boolean): Promise<void> {
    await httpClient.agent.patch(AGENT_ROUTES.memory.settings, { enabled });
  },

  /** 全部忘掉。回删掉的条数，好让界面说清删了什么。 */
  async forgetAll(): Promise<{ removed: number }> {
    return unwrap(
      await httpClient.agent.delete<ApiResponse<{ removed: number }>>(
        AGENT_ROUTES.memory.forgetAll,
      ),
    );
  },

  /**
   * 记一次「我不要这个改动」。
   *
   * 只报**动作 id**，事实文案由服务端拼——记忆会进 prompt，让客户端传自由文本等于开一个
   * 往自己上下文里塞任意内容的口子。
   *
   * 一次拒绝不足以成为偏好（初始强度低于召回门槛），第二次才开始影响 AI。
   */
  async recordRejection(action: string): Promise<void> {
    await httpClient.agent.post(AGENT_ROUTES.memory.rejection, { action });
  },
};
