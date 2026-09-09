import { getAuthToken } from '@/lib/api/httpClient';
import { API_ORIGIN, API_ROUTES } from '@/lib/api/routes';

export type StoredAttachment = {
  key: string;
  filename: string;
  contentType: string;
};

type ReadUrl = { url: string; expiresAt: string };

export class AttachmentUploadError extends Error {}

async function authenticatedJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new AttachmentUploadError('Authentication is required to upload files');

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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

/** 文件先交给平台后端，由后端写入私有 R2；浏览器不直接连接 R2。 */
export async function uploadAttachmentToBackend(
  file: File,
  signal?: AbortSignal,
): Promise<StoredAttachment> {
  const token = await getAuthToken();
  if (!token) throw new AttachmentUploadError('Authentication is required to upload files');
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${API_ROUTES.uploads.attachment}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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
  const result = await authenticatedJson<ReadUrl>(
    API_ROUTES.uploads.attachmentReadUrl,
    { key },
    signal,
  );
  if (!result.url) throw new AttachmentUploadError('Could not read attachment');
  return result.url;
}
