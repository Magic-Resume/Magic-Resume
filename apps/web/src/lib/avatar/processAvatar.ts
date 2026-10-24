import { compressAvatarImage, ACCEPTED_IMAGE_TYPES } from '@/lib/utils/image';

/** 用户选图后的最大原始大小(压缩前)。太离谱的直接拒,连解码都省了。 */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export type AvatarUploadError = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'PROCESS_FAILED';

export class AvatarError extends Error {
  code: AvatarUploadError;
  constructor(code: AvatarUploadError) {
    super(code);
    this.code = code;
  }
}

/**
 * 处理一张头像,返回可写入 info.avatar 的字符串:压缩后的 data:URL,直接内嵌进
 * 简历 JSON,不经过任何后端。
 */
export async function processAndStoreAvatar(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new AvatarError('UNSUPPORTED_TYPE');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarError('TOO_LARGE');
  }
  try {
    return (await compressAvatarImage(file)).dataUrl;
  } catch {
    throw new AvatarError('PROCESS_FAILED');
  }
}
