import { BACKEND_PROXY_ORIGIN, API_ROUTES } from '@/lib/api/routes';

export type StoredAttachment = {
  key: string;
  filename: string;
  contentType: string;
};

type ReadUrl = { url: string; expiresAt: string };

export class AttachmentUploadError extends Error {}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_PROXY_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error | undefined)?.name === 'AbortError') throw error;
    throw new AttachmentUploadError('Could not prepare attachment upload');
  }

  if (!response.ok) {
    throw new AttachmentUploadError(
      response.status === 413 ? 'File too large' : 'Could not prepare attachment upload',
    );
  }
  const payload = (await response.json()) as { data?: T };
  if (!payload.data) throw new AttachmentUploadError('Could not prepare attachment upload');
  return payload.data;
}

/** 文件交给 AI 后端保管（经本应用的 `/api/backend` 转发）；浏览器不直接连存储。 */
export async function uploadAttachmentToBackend(
  file: File,
  signal?: AbortSignal,
): Promise<StoredAttachment> {
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(`${BACKEND_PROXY_ORIGIN}${API_ROUTES.uploads.attachment}`, {
      method: 'POST',
      body: form,
      signal,
    });
  } catch (error) {
    if ((error as Error | undefined)?.name === 'AbortError') throw error;
    throw new AttachmentUploadError('Could not upload attachment');
  }
  if (!response.ok) {
    throw new AttachmentUploadError(
      response.status === 413 ? 'File too large' : 'Could not upload attachment',
    );
  }
  const payload = (await response.json()) as { data?: StoredAttachment };
  if (!payload.data?.key) throw new AttachmentUploadError('Could not upload attachment');
  return payload.data;
}

/** 仅在发送时请求一次短期 GET URL，传给解析服务后不会写入会话或聊天文本。 */
export async function getAttachmentReadUrl(key: string, signal?: AbortSignal): Promise<string> {
  const result = await postJson<ReadUrl>(
    API_ROUTES.uploads.attachmentReadUrl,
    { key },
    signal,
  );
  if (!result.url) throw new AttachmentUploadError('Could not read attachment');
  return result.url;
}
