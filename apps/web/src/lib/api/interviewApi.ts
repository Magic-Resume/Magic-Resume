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
  revision?: number;
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
  /** 归档列表通常不带 JD；详情接口会明确返回 null 或完整文本。 */
  jobDescription?: string | null;
  report: { overall: number; band: InterviewBand } | null;
}

export interface ArchivedInterviewDetail
  extends Omit<ArchivedInterview, 'report' | 'jobDescription'> {
  jobDescription: string | null;
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

/**
 * 一次 SDP 交换的结果。
 *
 * `primer` 由调用方在通道开启后灌给上游；`connection_id` 是这条连接的租约凭据——
 * 之后的续租与归还都认它，不续就会被服务端回收。
 */
export interface VoiceSessionResult {
  connection_id: string;
  expires_in_seconds: number;
  heartbeat_interval_seconds: number;
  answer_sdp: string;
  /** **最终是谁接的**——链首没有可派账号时这里会是降级后的那一条。 */
  channel: InterviewVoiceChannel;
  voice: string;
  /**
   * 面试官人格，由调用方在通道开启后灌给上游。
   *
   * **只有客户端投递的渠道才有**（lyra）。vega 的人格在建连时就写进了上游
   * `session.instructions`，这里是空串——再发一遍等于多一条能被改掉的路径。
   */
  primer: string;
  /** 这一场的时长预算（秒）。到点要自己收尾——服务端掐不断已经接通的通话。 */
  session_budget_seconds: number | null;
  /** 窗口还剩多久：断线重连时小于 `session_budget_seconds`。 */
  remaining_seconds: number | null;
}

/** 续租的回执。`should_stop` 是告知，不是强制——媒体直连上游，服务端掐不断。 */
export interface VoiceHeartbeatResult {
  expires_in_seconds: number;
  remaining_seconds: number | null;
  should_stop: boolean;
}

/**
 * 语音渠道的代号。与后端 `InterviewVoiceChannel` 对齐。
 *
 * **名字不带厂商**——换上游不用改这里。对照见
 * `Magic-Resume-Core/docs/reference/interview-voice-channels.md`。
 */
export type InterviewVoiceChannel = 'vega' | 'lyra' | 'atlas';

/**
 * 建连入口。
 *
 * `channel` 是**入口不是结论**：vega / lyra 要到换 SDP 那一刻才知道池子里有没有
 * 账号，**最终是谁接的以 answer 响应里的 `channel` 为准**。`chain` 是这个订阅
 * 还能往下落到哪条。`url`/`token` 只有 atlas 才有。
 */
export interface VoiceCredentials {
  channel: InterviewVoiceChannel | null;
  chain: InterviewVoiceChannel[];
  url?: string;
  token?: string;
}

/** 开一场面试要带的东西。`start` 与 `startStream` 共用，两者只是取回方式不同。 */
export interface StartInterviewInput {
  resume_context: string;
  role?: string;
  job_description?: string;
  /**
   * 库里那份简历的 id。服务端据此回源拿结构化简历，转成 Markdown 灌给 上游语音渠道 的
   * 上游面试官——`resume_context` 是编辑器算好的字符串，够开场但不够当 prompt 素材。
   */
  resume_id?: string;
  /**
   * `mode: 'voice'` 才会拿到语音凭据；缺省是文字面试。
   * `language`/`difficulty` 由 agent 在入口卡里问定，服务端据此写 prompt。
   */
  config?: {
    mode?: 'voice';
    language?: 'zh' | 'en';
    difficulty?: 'entry' | 'standard' | 'hard';
    /** 点名语音渠道；缺省按订阅声明的顺序。点名越不过订阅。 */
    channel?: InterviewVoiceChannel;
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

  /**
   * 建连凭据。响应里的 `transport` 决定走 LiveKit 还是 上游语音渠道——
   * 后者没有 url/token，客户端拿 offer 去 `voiceSession` 换 answer。
   */
  async voiceToken(sessionId: string): Promise<VoiceCredentials> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<VoiceCredentials>>(
        AGENT_ROUTES.interview.voiceToken(sessionId),
      ),
    );
  },

  /**
   * GPT Voice 的 SDP 交换：浏览器出 offer，服务端拿去上游换 answer。
   *
   * 响应里的 `primer` 是面试官 prompt——上游的 session schema 没有 instructions 字段，
   * 只能在 DataChannel 开启后当成一条对话消息灌进去，所以随这次往返一起带回来。
   */
  async voiceSession(
    sessionId: string,
    offerSdp: string,
    connectionId: string,
  ): Promise<VoiceSessionResult> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<VoiceSessionResult>>(
        AGENT_ROUTES.interview.voiceSession(sessionId),
        { offer_sdp: offerSdp, connection_id: connectionId },
      ),
    );
  },

  /**
   * 续租。断线不续，服务端到期自动回收这条连接。
   *
   * 顺带把上游报的账号剩余音频秒数捎回去——服务端自己探不到这个数
   * （它的额度探针是 Codex 口径），只有通话中的 `usage_update` 里才有。
   */
  async voiceHeartbeat(
    sessionId: string,
    connectionId: string,
    audioSecondsRemaining?: number | null,
  ): Promise<VoiceHeartbeatResult> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<VoiceHeartbeatResult>>(
        AGENT_ROUTES.interview.voiceHeartbeat(sessionId),
        {
          connection_id: connectionId,
          ...(typeof audioSecondsRemaining === 'number'
            ? { audio_seconds_remaining: Math.max(0, Math.round(audioSecondsRemaining)) }
            : {}),
        },
      ),
    );
  },

  /**
   * 报告「连上了但上游从没 bootstrap」。
   *
   * 上游对它不认的 session 字段不报错，只是永远不下发 `session_bootstrap`，
   * HTTP 照回 201——服务端签发 answer 时看不出来，只有我们等得到这个超时。
   * 服务端据此标记那个账号；`retryable` 为真就换个 connection_id 重连。
   */
  async voiceDegraded(
    sessionId: string,
    connectionId: string,
  ): Promise<{ retryable: boolean }> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<{ retryable: boolean }>>(
        AGENT_ROUTES.interview.voiceDegraded(sessionId),
        { connection_id: connectionId },
      ),
    );
  },

  /** 主动归还。正常离开时发，省得占着租约等它过期。 */
  async voiceRelease(
    sessionId: string,
    connectionId: string,
  ): Promise<void> {
    await httpClient.agent.post(
      AGENT_ROUTES.interview.voiceRelease(sessionId),
      { connection_id: connectionId },
    );
  },

  /**
   * 回传一轮转写。**只发定稿的**：上游是逐字增量推送，发中间态会把半句话灌进会话。
   */
  async recordVoiceTranscript(
    sessionId: string,
    input: {
      /**
       * 幂等键。服务端按它 + 内容哈希判重——断线重连把同一条再推一次会被吸收，
       * 而候选人**真的**重复说同一句话不会被误吞（那是旧的「和上一条相同」判据的毛病）。
       */
      transcript_id: string;
      role: 'user' | 'assistant';
      text: string;
      at?: number;
    },
  ): Promise<{ session_id: string; message_count: number }> {
    return unwrap(
      await httpClient.agent.post<
        ApiResponse<{ session_id: string; message_count: number }>
      >(AGENT_ROUTES.interview.voiceTranscript(sessionId), input),
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
