import axios from 'axios';
import { isCloudMode } from '@/lib/config/app';
import { compressAvatarImage, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/image';
import { API_ROUTES } from '@/lib/api/routes';
import { httpClient, type ApiResponse } from '@/lib/api/httpClient';

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
 *  - cloud 模式:压缩后经 Core API `POST /api/uploads/avatar` 传 R2 → 返回公开 URL;
 *    上传后端在 Magic-Core(platform-api),R2 密钥只在 Core,前端只压缩 + 调接口。
 *  - self-hosted 模式:压缩后返回 data:URL,直接内嵌进简历 JSON(零后端)。
 */
export async function processAndStoreAvatar(file: File): Promise<string> {
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

  // cloud:经 Core API 传 R2(带 Clerk JWT,由 httpClient 拦截器注入)。
  const form = new FormData();
  form.append('file', compressed.blob, 'avatar.jpg');

  try {
    const res = await httpClient.api.post<ApiResponse<{ url: string }>>(
      API_ROUTES.uploads.avatar,
      form,
    );
    const url = res.data?.data?.url;
    if (!url) throw new AvatarError('UPLOAD_FAILED');
    return url;
  } catch (err) {
    if (err instanceof AvatarError) throw err;
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    throw new AvatarError(status === 413 ? 'TOO_LARGE' : 'UPLOAD_FAILED');
  }
}
