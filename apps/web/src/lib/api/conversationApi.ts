import { httpClient, type ApiResponse } from './httpClient';
import { AGENT_ROUTES } from './routes';

export interface ConversationSummary {
  id: string;
  title: string | null;
  resumeId: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface ConversationMessageView {
  seq: number;
  role: string;
  content: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  snapshot: Record<string, unknown> | null;
  revision: number;
  messages: ConversationMessageView[];
}

/** `replaced` 不是错误——重投或「这条消息本身变了」的正常结果，调用方同样该出队。 */
export type AppendResult = { seq: number; status: 'stored' | 'replaced' };

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

export const conversationApi = {
  /** `resumeId` 不是可选的便利参数：跨简历接管会让 AI 对着用户没在看的简历提建议。 */
  async list(resumeId?: string, limit = 50): Promise<ConversationSummary[]> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<ConversationSummary[]>>(
        AGENT_ROUTES.conversations.list,
        { params: { limit, ...(resumeId ? { resumeId } : {}) } },
      ),
    );
  },

  async get(id: string): Promise<ConversationDetail> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<ConversationDetail>>(
        AGENT_ROUTES.conversations.byId(id),
      ),
    );
  },

  /** 建或认领。id 由客户端生成（同时是 LangGraph thread_id），所以服务端是 upsert。 */
  async ensure(
    id: string,
    input: { resumeId?: string; title?: string },
  ): Promise<void> {
    await httpClient.agent.put(AGENT_ROUTES.conversations.byId(id), input);
  },

  /** 幂等：`(id, seq)` 唯一，重投覆盖同一行并拿到 `replaced`。 */
  async appendMessage(
    id: string,
    message: {
      seq: number;
      role: string;
      content?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<AppendResult> {
    return unwrap(
      await httpClient.agent.put<ApiResponse<AppendResult>>(
        AGENT_ROUTES.conversations.message(id, message.seq),
        message,
      ),
    );
  },

  /** 整会话唯一的状态。乐观锁，409 时服务端会带上当前 revision。 */
  async patchSnapshot(
    id: string,
    input: {
      snapshot: Record<string, unknown>;
      expectedRevision: number;
      title?: string;
    },
  ): Promise<{ revision: number }> {
    return unwrap(
      await httpClient.agent.patch<ApiResponse<{ revision: number }>>(
        AGENT_ROUTES.conversations.snapshot(id),
        input,
      ),
    );
  },

  async remove(id: string): Promise<void> {
    await httpClient.agent.delete(AGENT_ROUTES.conversations.byId(id));
  },

  /** 存量导入。幂等，失败可整批重试；**导入成功后仍不删本地**，留一个版本周期做后悔药。 */
  async import(
    id: string,
    body: {
      resumeId?: string;
      title?: string;
      messages: Array<{
        seq: number;
        role: string;
        content?: string;
        payload?: Record<string, unknown>;
      }>;
    },
  ): Promise<{ id: string; stored: number; skipped: number }> {
    return unwrap(
      await httpClient.agent.post<
        ApiResponse<{ id: string; stored: number; skipped: number }>
      >(AGENT_ROUTES.conversations.import(id), body),
    );
  },
};
