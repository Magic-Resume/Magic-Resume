import { isCloudMode } from '@/lib/config/app';
import { compressAvatarImage, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/image';
import { WEB_AGENT_ROUTES } from '@/lib/api/routes';

/** 用户选图后的最大原始大小(压缩前)。太离谱的直接拒,连解码都省了。 */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export type AvatarUploadError =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'PROCESS_FAILED'
  | 'UPLOAD_FAILED';

export class AvatarError extends Error {
  code: AvatarUploadError;
  constructor(code: AvatarUploadError) {
    super(code);
    this.code = code;
  }
}

/**
 * 处理并"落地"一张头像,返回可写入 info.avatar 的字符串。
 *  - cloud 模式:压缩后 POST 到 /api/uploads/avatar → 返回 R2 公开 URL;
 *  - self-hosted 模式:压缩后返回 data:URL,直接内嵌进简历 JSON(零后端)。
 *
 * @param prevUrl 旧头像值(用于 cloud 模式删除旧对象,self-hosted 忽略)
 */
export async function processAndStoreAvatar(file: File, prevUrl?: string): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new AvatarError('UNSUPPORTED_TYPE');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarError('TOO_LARGE');
  }

  let compressed;
  try {
    compressed = await compressAvatarImage(file);
  } catch {
    throw new AvatarError('PROCESS_FAILED');
  }

  // self-hosted:没有后端,直接内嵌。
  if (!isCloudMode) {
    return compressed.dataUrl;
  }

  // cloud:传 R2。
  const form = new FormData();
  form.append('file', compressed.blob, 'avatar.jpg');
  if (prevUrl) form.append('prevUrl', prevUrl);

  let res: Response;
  try {
    res = await fetch(WEB_AGENT_ROUTES.avatarUpload, { method: 'POST', body: form });
  } catch {
    throw new AvatarError('UPLOAD_FAILED');
  }
  if (!res.ok) {
    throw new AvatarError(res.status === 413 ? 'TOO_LARGE' : 'UPLOAD_FAILED');
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new AvatarError('UPLOAD_FAILED');
  return data.url;
}
