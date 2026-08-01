import 'server-only';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 服务端接入(S3 兼容 API)。密钥只在服务端读,永不出网到浏览器。
 *
 * 需要的环境变量(见 .env.example):
 *  - R2_ACCOUNT_ID          Cloudflare 账号 ID
 *  - R2_ACCESS_KEY_ID       R2 API Token 的 Access Key ID
 *  - R2_SECRET_ACCESS_KEY   R2 API Token 的 Secret
 *  - R2_BUCKET              桶名(magic-resume-assets)
 *  - R2_PUBLIC_BASE_URL     公开读地址,无尾斜杠(如 https://pub-xxxx.r2.dev 或自定义域名)
 */

export const R2_BUCKET = process.env.R2_BUCKET ?? '';
export const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

const accountId = process.env.R2_ACCOUNT_ID ?? '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';

/** 五个变量齐了才算配好;没配好时上传 route 返回 503 而不是崩。 */
export function isR2Configured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && R2_BUCKET && R2_PUBLIC_BASE_URL);
}

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!isR2Configured()) throw new Error('R2_NOT_CONFIGURED');
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function publicUrlForKey(key: string): string {
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

/**
 * 从一个公开 URL 反解出对象 key —— 仅当它确实是本桶公开地址下、
 * 且落在 `avatars/<userId>/` 前缀里时才返回,否则 null。
 * 用于「换头像删旧对象」时防止越权删到别人 / 别的路径的对象。
 */
export function ownAvatarKeyFromUrl(url: string | undefined | null, userId: string): string | null {
  if (!url || !R2_PUBLIC_BASE_URL) return null;
  const prefix = `${R2_PUBLIC_BASE_URL}/`;
  if (!url.startsWith(prefix)) return null;
  const key = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
  const expected = `avatars/${userId}/`;
  if (!key.startsWith(expected) || key.includes('..')) return null;
  return key;
}
