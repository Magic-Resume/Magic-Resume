/**
 * Where the browser sends AI Lab requests. Everything goes through this app's
 * own route handlers, which forward to the configured AI backend
 * (`AI_BACKEND_URL`, see `lib/ai/backend.ts`): the browser never learns the
 * backend's address and needs no CORS on it.
 *
 * - `WEB_AGENT_ROUTES`: the dedicated agent handlers under `app/api/chat-agent`.
 * - `BACKEND_PROXY_ORIGIN`: a passthrough for the plain JSON endpoints, used
 *   as the axios base URL in `httpClient`.
 */
export const BACKEND_PROXY_ORIGIN = '/api/backend';

/** Backend JSON endpoints AI Lab calls through {@link BACKEND_PROXY_ORIGIN}. */
export const API_ROUTES = {
  resumes: {
    workspaceProposal: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}`,
    workspacePrepare: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/prepare`,
    workspaceResolve: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/resolve`,
    workspaceRejectAll: (id: string, proposalId: string) => `/api/resumes/${id}/workspace/proposals/${proposalId}/reject-all`,
  },
  /** Chat attachments: the backend stores the file and hands back a short-lived read URL. */
  uploads: {
    attachment: '/api/uploads/attachment',
    attachmentReadUrl: '/api/uploads/attachment/read-url',
  },
} as const;

export const WEB_AGENT_ROUTES = {
  pdfParse:         '/api/pdf/parse',
  chat:             '/api/chat-agent',
  chatApprove:      '/api/chat-agent/approve',
  chatSession:      '/api/chat-agent/session',
  chatEdit:         '/api/chat-agent/edit',
} as const;
