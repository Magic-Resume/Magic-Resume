import { WEB_AGENT_ROUTES } from '@/lib/api/routes';
import { fromResponse } from '@/lib/errors/normalize';
import type { AppError } from '@/lib/errors/types';
import type { AgentLlmConfig, AgentSseEvent } from './types';
import type { AnalysisImprovementAction } from '@/types/agent/multi-persona';

/**
 * AI Lab 唯一的服务客户端。调用都经 Next.js route handler，所以这里用相对 `/api/...`
 * 路径，鉴权由服务端处理。
 */

/**
 * 把一次失败响应变成可抛的 {@link AgentRequestError}。
 *
 * 以前这里是七条按英文散文匹配的正则。它们判错过一次真实故障：BFF 把上游响应整体换成
 * "Backend request failed with status 429"，正则命中里面那个 "429"，于是「日额度用完」
 * 被说成「请求过于频繁」，而下游的充值闸门测的是中文串「额度不足」——两边都没命中，
 * 用户看到一句不相干的话，且没有任何充值入口。
 *
 * 现在读码不读字符串。判定只此一处（`fromResponse`），闸门也读同一个码。
 */
async function readError(res: Response): Promise<AgentRequestError> {
  return new AgentRequestError(await fromResponse(res, 'bff'));
}

/** 带上归一化后的 {@link AppError}，让 catch 侧不必再从 message 里往回猜。 */
export class AgentRequestError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.errorCode);
    this.name = 'AgentRequestError';
  }
}

/**
 * 把 SSE 响应体解析成 {@link AgentSseEvent}。所有流式调用共用它，帧处理只此一处。
 * 遇到非流式错误响应（后端开流前发的 401/422/429）会抛错。
 */
export async function* consumeSseFrames(res: Response): AsyncGenerator<AgentSseEvent> {
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // 按行解析：既容忍标准 `\n\n` 分帧的 SSE，也容忍把 `\n\n` 压成 `\n` 的代理层。
  //
  // 解析失败此前是完全无声的：一帧被中间层折行、或 JSON 里混进未转义换行，整条简历改动
  // 就这么消失，连一句日志都没有。数出来并在流末喊一声——不改行为，只是让它不再无迹可寻。
  let malformed = 0;
  let lastStreamSequence = 0;
  const parse = (raw: string): AgentSseEvent | null => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return null;
    const json = line.slice(5).trim();
    if (!json) return null;
    let event: AgentSseEvent;
    try {
      event = JSON.parse(json) as AgentSseEvent;
    } catch {
      malformed += 1;
      if (malformed === 1) {
        console.warn('[ai] unparsable SSE frame (first 80 chars):', json.slice(0, 80));
      }
      return null;
    }
    // Missing protocolVersion is the supported v0 compatibility path. A v1
    // stream must be gap-free; otherwise accepting its final snapshot could
    // reconcile against a patch we never received.
    if (event.protocolVersion !== undefined && event.protocolVersion !== 1) {
      throw new AgentRequestError({
        errorCode: 'upstream_unavailable',
        subCode: 'sse_protocol_unsupported',
        retryable: true,
        source: 'sse',
        cause: event.protocolVersion,
      });
    }
    if (event.protocolVersion === 1) {
      const received = event.streamSequence;
      const expected = lastStreamSequence + 1;
      if (!Number.isInteger(received) || received !== expected) {
        throw new AgentRequestError({
          errorCode: 'upstream_unavailable',
          subCode: 'sse_sequence_gap',
          retryable: true,
          source: 'sse',
          cause: { expected, received },
        });
      }
      lastStreamSequence = received;
    }
    return event;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const ev = parse(raw);
      if (ev) yield ev;
    }
  }
  const tail = parse(buffer);
  if (tail) yield tail;
  if (malformed > 0) {
    console.warn(`[ai] dropped ${malformed} unparsable SSE frame(s) this run`);
  }
}

/** 流式跑一次 agent，产出解析好的 {@link AgentSseEvent}。 */
export async function* streamAgent(
  url: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<AgentSseEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  yield* consumeSseFrames(res);
}

/** 流式跑 PDF 导入解析。FormData 体，故意不设 `Content-Type`——multipart 边界由浏览器写。 */
export async function* streamPdfParse(
  formData: FormData,
  signal?: AbortSignal
): AsyncGenerator<AgentSseEvent> {
  const res = await fetch(WEB_AGENT_ROUTES.pdfParse, {
    method: 'POST',
    body: formData,
    signal,
  });
  yield* consumeSseFrames(res);
}

export interface ChatStreamParams {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /**
   * 对话档位（共创 / 规划 / 问答）。只传枚举——契约文本在服务端，客户端传原文等于
   * 开放任意系统提示注入。服务端按档位注入到单次模型调用，不进会话历史，所以切
   * 档位不会留下互相矛盾的旧契约。
   */
  agentMode?: 'cocreate' | 'plan' | 'ask';
  mode?: 'create' | 'optimize' | 'analyze' | 'fit' | 'translate' | 'interview' | 'general';
  /** 一次对话 = 一个 sessionId，"新对话"才换新的。服务端据此跨轮次续上下文。 */
  sessionId?: string;
  /**
   * id of the resume this session is scoped to. The client sends an id instead of
   * pushing a full resume snapshot into every chat turn.
   */
  resumeId?: string;
  request_type?: 'fix_analysis_weakness';
  context?: { analysisIssue?: AnalysisImprovementAction };
  /**
   * User-provided model config for this AI request.
   */
  config?: AgentLlmConfig;
  signal?: AbortSignal;
}

/** Conversational chat stream (create / general) via the web route handler. */
export function streamChat({ signal, ...body }: ChatStreamParams): AsyncGenerator<AgentSseEvent> {
  return streamAgent(WEB_AGENT_ROUTES.chat, body, signal);
}

/**
 * Reclaim server-side session resources when the user explicitly starts a new chat.
 * Modal close only puts the AI Lab away; the transcript + sessionId are locally
 * resumable and the server-side TTL sweeper remains the backstop.
 * Carries only the sessionId, never the user's model key.
 */
export async function endSessionThread(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await fetch(WEB_AGENT_ROUTES.chatSession, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    });
  } catch {
    // best-effort — the server-side TTL sweeper reclaims anything missed.
  }
}

/** A human's decision on a paused tool call (native HITL). */
export interface HitlDecision {
  /** approve/reject gate a sensitive tool; `edit` re-runs the tool with new args —
   *  GenUI widgets use it to inject the user's submitted form values. */
  type: 'approve' | 'reject' | 'edit';
  /** feedback to the model when rejecting. */
  message?: string;
  /** for `edit`: the tool call with the user's values merged into args. */
  editedAction?: { name: string; args: Record<string, unknown> };
}

export interface ApproveToolParams {
  /** the paused conversation session to resume */
  sessionId: string;
  /** one decision per pending action request (read_resume → a single decision) */
  decisions: HitlDecision[];
  /** re-sent so the resumed session keeps the same scope and model settings */
  resumeId?: string;
  /** 续跑沿用同一档位，否则批准之后那半程回到无约束状态。 */
  agentMode?: 'cocreate' | 'plan' | 'ask';
  request_type?: 'fix_analysis_weakness';
  config?: AgentLlmConfig;
  signal?: AbortSignal;
}

/**
 * Reply to a paused tool-approval request. The route streams the continuation, so
 * consume it like {@link streamChat}.
 */
export function approveTool({
  signal,
  ...body
}: ApproveToolParams): AsyncGenerator<AgentSseEvent> {
  return streamAgent(WEB_AGENT_ROUTES.chatApprove, body, signal);
}
