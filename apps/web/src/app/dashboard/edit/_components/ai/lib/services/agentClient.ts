import { WEB_AGENT_ROUTES } from '@/lib/api/routes';
import type { AgentLlmConfig, AgentSseEvent } from './types';

/**
 * AI Lab 唯一的服务客户端。调用都经 Next.js route handler，所以这里用相对 `/api/...`
 * 路径，鉴权由服务端处理。
 */

/**
 * 把上游错误消息映射成用户能行动的友好文案。后端透传的原始字符串
 * （如 `Upstream 'agent' unavailable`、`invalid_api_key`）对用户没有意义，
 * 按状态码 + 关键词归类后再展示；无法归类时回退原始信息。
 */
function friendlyAgentError(status: number, raw: string): string {
  const haystack = `${status} ${raw}`;
  let friendly = '';
  if (/timeout|timed out|ETIMEDOUT|abort/i.test(haystack)) {
    friendly = '请求超时，请检查网络后重试';
  } else if (/unauthori[sz]ed|forbidden|invalid.*(api.?key|key|token|credential)|authentication|401|403/.test(haystack)) {
    friendly = 'API Key 无效或没有权限，请检查密钥';
  } else if (/quota|insufficient.*(balance|credit|quota)|balance|billing|402/.test(haystack)) {
    friendly = '账户额度不足，请检查余额或配额';
  } else if (/rate.?limit|too many requests|429/.test(haystack)) {
    friendly = '请求过于频繁，请稍后重试';
  } else if (/upstream|origin|gateway|backend.*(unavail|down|error)|502|503/.test(haystack)) {
    friendly = '服务商上游暂不可用，请稍后重试或检查服务状态';
  } else if (/not found|no such model|404/.test(haystack)) {
    friendly = '接口或模型不存在，请检查配置';
  } else if (status >= 500) {
    friendly = '服务商返回服务器错误，请稍后重试';
  }
  if (!friendly) return raw;
  return raw && raw !== friendly ? `${friendly}（${raw}）` : friendly;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const raw =
      (data?.error || data?.message || data?.detail || `请求失败（${res.status}）`) as string;
    return friendlyAgentError(res.status, raw);
  } catch {
    return `请求失败（${res.status}）`;
  }
}

/**
 * 把 SSE 响应体解析成 {@link AgentSseEvent}。所有流式调用共用它，帧处理只此一处。
 * 遇到非流式错误响应（后端开流前发的 401/422/429）会抛错。
 */
export async function* consumeSseFrames(res: Response): AsyncGenerator<AgentSseEvent> {
  if (!res.ok || !res.body) throw new Error(await readError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // 按行解析：既容忍标准 `\n\n` 分帧的 SSE，也容忍把 `\n\n` 压成 `\n` 的代理层。
  const parse = (raw: string): AgentSseEvent | null => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return null;
    const json = line.slice(5).trim();
    if (!json) return null;
    try {
      return JSON.parse(json) as AgentSseEvent;
    } catch {
      return null;
    }
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
