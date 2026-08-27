import { getAuthToken, httpClient, type ApiResponse } from './httpClient';
import { AGENT_ROUTES, API_ORIGIN } from './routes';

interface SseEvent {
  type?: string;
  step?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * 逐帧读一条 SSE。
 *
 * **按行解析**而不是按 `\n\n` 切：中间层（nginx / 各种代理）会把空行压掉，按帧切在
 * 生产上会一条都读不到。这是 `agentClient.consumeSseFrames` 上踩过的坑，同样适用这里。
 * 跨 chunk 的半行留到下一次——不这样切会在网络分片处把一个 JSON 劈成两半。
 */
async function* readSseJson(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          yield JSON.parse(json) as SseEvent;
        } catch {
          // 上游偶尔发心跳注释行；解析不了就跳过，不该让整条流失败。
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type InterviewStage =
  | 'introduction'
  | 'experience'
  | 'technical'
  | 'behavioral'
  | 'closing'
  | 'finished';

export interface StartInterviewResult {
  session_id: string;
  message: string;
  stage: InterviewStage;
  /** 仅语音会话返回；120 秒有效。 */
  voiceTicket?: string;
}

export interface InterviewTurnResult {
  message: string;
  stage: InterviewStage;
  finished: boolean;
  revision: number;
}

export type InterviewDimension =
  | 'expression'
  | 'depth'
  | 'jobFit'
  | 'structure';

/** 档位说的是**准备度**，不是录用结论——一场模拟面试评不出该不该录。 */
export type InterviewBand = 'ready' | 'nearly' | 'developing' | 'early';

export interface InterviewQuestionReview {
  stage: InterviewStage;
  question: string;
  /** 候选人原话；服务端已校验过它逐字来自 transcript。 */
  answerExcerpt: string;
  strengths: string[];
  improvements: string[];
  betterAnswer?: string;
}

export interface InterviewReport {
  /** 服务端按四维加权算出来的，不是模型自报的。 */
  overall: number;
  band: InterviewBand;
  dims: Record<InterviewDimension, number>;
  strengths: string[];
  improvements: string[];
  reviews: InterviewQuestionReview[];
  /** 因为原话对不上被剔除的点评数。>0 说明模型试图编造候选人的发言。 */
  droppedReviews: number;
}

export interface ArchivedInterview {
  id: string;
  role: string;
  stage: InterviewStage;
  startedAt: string;
  finishedAt: string | null;
  report: { overall: number; band: InterviewBand } | null;
}

export interface ArchivedInterviewDetail
  extends Omit<ArchivedInterview, 'report'> {
  transcript: Array<{
    role: 'user' | 'assistant';
    content: string;
    stage?: InterviewStage;
  }>;
  report: InterviewReport | null;
}

export interface FinishInterviewResult {
  stage: 'finished';
  finished: true;
  revision: number;
}

/** 进行中那一场的热态。`hasReport` 即「已结束」——服务端会话里没有单独的 finished 位。 */
export interface LiveInterview {
  session_id: string;
  stage: InterviewStage;
  role?: string;
  config: {
    mode?: string;
    language?: 'zh' | 'en';
    difficulty?: 'entry' | 'standard' | 'hard';
  };
  revision: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    stage?: InterviewStage;
  }>;
  hasReport: boolean;
}

/** 开一场面试要带的东西。`start` 与 `startStream` 共用，两者只是取回方式不同。 */
export interface StartInterviewInput {
  resume_context: string;
  role?: string;
  job_description?: string;
  /**
   * `mode: 'voice'` 才会拿到 `voiceTicket`；缺省是文字面试。
   * `language`/`difficulty` 由 agent 在入口卡里问定，服务端据此写 prompt。
   */
  config?: {
    mode?: 'voice';
    language?: 'zh' | 'en';
    difficulty?: 'entry' | 'standard' | 'hard';
  };
}

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

export const interviewApi = {
  async start(input: StartInterviewInput): Promise<StartInterviewResult> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<StartInterviewResult>>(
        AGENT_ROUTES.interview.start,
        input,
      ),
    );
  },

  /**
   * 开一场面试，**边准备边报进度**。
   *
   * 开场准备里有一次 RAG 检索和一次完整的 LLM 生成，是好几秒的空白。这几步真实可分辨，
   * 所以照实报给用户看，而不是转一个圈。
   *
   * `onProgress` 收到的每一步都**真的发生了**——检索面经经常被跳过（rollout 关闭、
   * 库不可用、A-B 落在 rag_off、没有岗位与 JD），跳过时不会有事件。所以调用方要跟着
   * 事件走，不能按固定顺序点亮。
   */
  async startStream(
    input: StartInterviewInput,
    onProgress: (step: 'session' | 'knowledge' | 'opening') => void,
  ): Promise<StartInterviewResult> {
    const token = await getAuthToken();
    const response = await fetch(
      `${API_ORIGIN}${AGENT_ROUTES.interview.startStream}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      },
    );
    // 流还没开始，这里的状态码仍然是有意义的。
    if (!response.ok || !response.body) {
      throw new Error(`interview start failed (${response.status})`);
    }

    let result: StartInterviewResult | null = null;
    for await (const event of readSseJson(response.body)) {
      if (event.type === 'progress' && event.step) {
        onProgress(event.step as 'session' | 'knowledge' | 'opening');
      } else if (event.type === 'done') {
        result = event as unknown as StartInterviewResult;
      } else if (event.type === 'error') {
        throw new Error(String(event.message ?? 'interview start failed'));
      }
    }
    // 流正常结束却没有 done：服务端半路挂了。不能静默返回一个空会话。
    if (!result?.session_id) throw new Error('interview start ended early');
    return result;
  },

  /**
   * 读一场**正在进行**的面试，用来恢复现场（刷新、直接带 URL 进来）。
   *
   * 与 `session()` 分开：那个读 Postgres 归档，面试结束后才有行；这个读 Redis 热态。
   * 服务端已剥掉 `resume_context` / `knowledgeContext`——那是喂模型的原料，几万字符。
   */
  async live(sessionId: string): Promise<LiveInterview> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<LiveInterview>>(
        AGENT_ROUTES.interview.live(sessionId),
      ),
    );
  },

  /** Redis 热态过期后，从 PostgreSQL 读取可长期回看的会话与报告。 */
  async archived(sessionId: string): Promise<ArchivedInterviewDetail> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<ArchivedInterviewDetail>>(
        AGENT_ROUTES.interview.session(sessionId),
      ),
    );
  },

  async chat(sessionId: string, message: string): Promise<InterviewTurnResult> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<InterviewTurnResult>>(
        AGENT_ROUTES.interview.chat,
        { session_id: sessionId, message },
      ),
    );
  },

  /**
   * 生成或取回评分报告。
   *
   * 走强模型，第一次可能要十几秒；服务端会把结果缓存在会话里，重复请求不再付第二次钱。
   * 超时放宽到 90 秒——默认 30 秒会在报告还在生成时就断掉。
   */
  async report(sessionId: string): Promise<InterviewReport> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<InterviewReport>>(
        AGENT_ROUTES.interview.report(sessionId),
        undefined,
        { timeout: 90_000 },
      ),
    );
  },

  /** 先把服务端会话推进到终态，成功后才能生成报告。 */
  async finish(sessionId: string): Promise<FinishInterviewResult> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<FinishInterviewResult>>(
        AGENT_ROUTES.interview.finish(sessionId),
      ),
    );
  },

  /** 删除归档会话；服务端同时级联报告并清理仍存在的 Redis 热态。 */
  async deleteSession(sessionId: string): Promise<void> {
    await httpClient.agent.delete(AGENT_ROUTES.interview.session(sessionId));
  },

  /** LiveKit 房间凭据。房间名 = 会话 id，identity = userId，worker 靠这两样对上。 */
  async voiceToken(
    sessionId: string,
  ): Promise<{ url: string; token: string }> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<{ url: string; token: string }>>(
        AGENT_ROUTES.interview.voiceToken(sessionId),
      ),
    );
  },

  async listSessions(): Promise<ArchivedInterview[]> {
    return unwrap(
      await httpClient.agent.get<ApiResponse<ArchivedInterview[]>>(
        AGENT_ROUTES.interview.sessions,
      ),
    );
  },
};
