/**
 * The single API origin — the whole frontend talks to ONE configured address.
 * Resolved at RUNTIME so one build can target any backend:
 *   - browser → `window.__ENV.apiOrigin`, injected by RuntimeEnvScript (layout)
 *   - server  → `process.env.APP_API_ORIGIN` (container env, read per request)
 *   - fallback → build-time `NEXT_PUBLIC_API_URL` / dev default
 * The runtime var is deliberately WITHOUT the `NEXT_PUBLIC_` prefix: Next inlines
 * `NEXT_PUBLIC_*` at build time into BOTH client and server bundles, which would
 * freeze the address into the image. A prefix-less var is read from the container
 * env at runtime (server), then shipped to the browser via `window.__ENV`.
 * Lives in this dep-free module so both client and server can import it without
 * pulling axios in via httpClient.
 */
type CommercialRuntime = { apiOrigin?: string };
declare global {
  interface Window {
    __ENV?: CommercialRuntime;
  }
}

function resolveApiOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.__ENV?.apiOrigin || 'http://localhost:3110';
  }
  return (
    process.env.APP_API_ORIGIN ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3110'
  );
}

export const API_ORIGIN = resolveApiOrigin();

/**
 * Product API routes.
 */
export const API_ROUTES = {
  resumes: {
    list:            '/api/resumes/mine',
    create:          '/api/resumes',
    byId:            (id: string) => `/api/resumes/${id}`,
    duplicate:       (id: string) => `/api/resumes/${id}/duplicate`,
    versions:        (id: string) => `/api/resumes/${id}/versions`,
    versionById:     (id: string, versionId: string) => `/api/resumes/${id}/versions/${versionId}`,
    workspace:       (id: string) => `/api/resumes/${id}/workspace`,
    workspaceProposal: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}`,
    workspacePrepare: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/prepare`,
    workspaceResolve: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/resolve`,
    workspaceRejectAll: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/reject-all`,
    // 资产库。列表是**账号级**的（不带 resumeId，跨简历汇总）；读正文、归档、留住
    // 仍走按简历的老路由——列表已经把 resumeId 带回来了。
    workspaceArtifacts: () => `/api/workspace/artifacts`,
    workspaceArtifact: (id: string, artifactId: string) => `/api/resumes/${id}/workspace/artifacts/${artifactId}`,
    workspaceArtifactArchive: (id: string, artifactId: string) => `/api/resumes/${id}/workspace/artifacts/${artifactId}/archive`,
    /** 真删除（整行消失）。与 archive 是两个语义：收起来 vs 当它没发生过。 */
    workspaceArtifactDelete: (id: string, artifactId: string) => `/api/resumes/${id}/workspace/artifacts/${artifactId}`,
    workspaceArtifactKeep: (id: string, artifactId: string) => `/api/resumes/${id}/workspace/artifacts/${artifactId}/keep`,
    shared:          (shareId: string) => `/api/resumes/shared/${shareId}`,
    sharedComments:  (shareId: string) => `/api/resumes/shared/${shareId}/comments`,
    sharedComment:   (shareId: string, commentId: string) => `/api/resumes/shared/${shareId}/comments/${commentId}`,
    sharedReplies:   (shareId: string, commentId: string) => `/api/resumes/shared/${shareId}/comments/${commentId}/replies`,
    sharedReply:     (shareId: string, commentId: string, replyId: string) => `/api/resumes/shared/${shareId}/comments/${commentId}/replies/${replyId}`,
  },
  users: {
    feedback:  '/api/users/feedback',
    pats:      '/api/users/me/personal-access-tokens',
    patRevoke: (tokenId: string) => `/api/users/me/personal-access-tokens/${tokenId}/revoke`,
    /** 服务条款同意。GET 问「还要不要同意」，POST 记下这一次。 */
    terms:     '/api/users/me/terms',
  },
  notifications: {
    list:     '/api/notifications',
    stream:   '/api/notifications/stream',
    markRead: (id: string) => `/api/notifications/${id}/read`,
    markAllRead: '/api/notifications/read',
    emailPreferences: '/api/notifications/preferences/email',
    announcement: (id: string) => `/api/announcements/${id}`,
  },
  /**
   * 投递面板的**只读**读取口。增删改查归 agent-service 的 `track_application` 工具——
   * 同一张表不该有两个各自演化的主人。
   */
  jobApplications: {
    board: '/api/job-applications',
    /** 清空整块面板（DELETE 同一地址）。面板容器删不掉，能删的只有内容。 */
    clear: '/api/job-applications',
  },
  // 校招时间线公开读（匿名可访问，gateway allowlist 已放行该精确路径）
  knowledge: {
    timelines: '/api/knowledge/timelines',
  },
  // 头像上传由 Core 承担：存储凭证、大小 / 魔数校验、限流、旧对象清理都在后端。
  // 曾经登记在下面的 WEB_AGENT_ROUTES 里，意味着 web 容器得自己持有一份 R2 密钥
  // 并维护第二套实现 —— 那是漂移，不是设计。
  uploads: {
    avatar: '/api/uploads/avatar',
    attachment: '/api/uploads/attachment',
    attachmentReadUrl: '/api/uploads/attachment/read-url',
  },
} as const;

/**
 * AI-related API routes.
 */
export const AGENT_ROUTES = {
  /** 对话历史。服务端为真相，本地退为缓存。 */
  conversations: {
    list:     '/api/conversations',
    byId:     (id: string) => `/api/conversations/${id}`,
    /** PUT 而非 POST——写队列会重投同一条，幂等语义要写在方法上。 */
    message:  (id: string, seq: number) => `/api/conversations/${id}/messages/${seq}`,
    snapshot: (id: string) => `/api/conversations/${id}/snapshot`,
    import:   (id: string) => `/api/conversations/${id}/import`,
  },
  /** 「AI 记住了我什么」——可见、可删是硬需求。 */
  memory: {
    list:   '/api/memory',
    forget: (kind: string, key: string) => `/api/memory/${kind}/${encodeURIComponent(key)}`,
    /** 记一次「我不要这个改动」。只报动作 id，文案由服务端拼。 */
    rejection: '/api/memory/rejection',
    /** 总开关。关掉 = 停用，**不删**——两件事分开。 */
    settings:  '/api/memory/settings',
    /** 全部忘掉。与关开关是两回事。 */
    forgetAll: '/api/memory',
  },
  /**
   * 求职画像。与 `memory` 并列而**互不引用**：那边是模型推断、会衰减的条目，这边是
   * 用户亲口说的、一直生效的一份文档。
   */
  jobProfile: {
    /** 读。没有画像回 404——那正是「要不要弹引导」的信号。 */
    get:        '/api/job-profile',
    /** 引导交卷：答案 → markdown 画像。 */
    generate:   '/api/job-profile/generate',
    /** 用上一次的答案重新合成。 */
    regenerate: '/api/job-profile/regenerate',
    /** 一句话改写 → 候选正文，**不落库**（PATCH）；落库走 PUT 同一个地址。 */
    root:       '/api/job-profile',
    /** 停用 ≠ 删除。 */
    settings:   '/api/job-profile/settings',
  },
  interview: {
    start:       '/api/interview/start',
    /** 同一条逻辑，但边准备边报进度——入场那几秒的文案跟着它走。 */
    startStream: '/api/interview/start/stream',
    chat:        '/api/interview/chat',
    session:     (sessionId: string) => `/api/interview/session/${sessionId}`,
    finish:      (sessionId: string) => `/api/interview/session/${sessionId}/finish`,
    /** 进行中那一场的热态（Redis）。`session` 读的是结束后才有的归档。 */
    live:        (sessionId: string) => `/api/interview/live/${sessionId}`,
    sessions:    '/api/interview/sessions',
    report:      (sessionId: string) => `/api/interview/report/${sessionId}`,
    /** LiveKit 房间凭据；房间与鉴权都交给 LiveKit，我们只回答「这场是不是你的」。 */
    voiceToken:  (sessionId: string) => `/api/interview/voice-token/${sessionId}`,
  },
} as const;

/**
 * Web-side AI route handlers. Centralizes the paths the AI Lab service layer
 * (`ai/lib/services`) calls so they aren't hardcoded inline.
 */
export const WEB_AGENT_ROUTES = {
  chat:             '/api/chat-agent',
  chatApprove:      '/api/chat-agent/approve',
  chatSession:      '/api/chat-agent/session',
  chatEdit:         '/api/chat-agent/edit',
  pdfParse:         '/api/pdf/parse',
} as const;
