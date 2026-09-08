import { generateShortHash } from '@/lib/utils/hash';

export type CrashIdentity = {
  /** 展示给用户、可复制的错误码。 */
  code: string;
  /** 自动重试的去重键，同一个错误在同一会话只自动重试一次。 */
  fingerprint: string;
};

/**
 * 一次渲染崩溃的身份。
 *
 * Next 的 `digest` 只在**服务端**异常时存在，纯客户端渲染崩溃拿不到——只认 digest 的话，
 * 错误码这一栏恰好会在最常见的一类崩溃里空着。所以拿不到就用错误自身指纹兜底：用户手里
 * 永远有一个能说清「是哪一次」的串。
 *
 * 指纹带上 `scope`（哪个边界接住的），否则两个边界上同名同消息的错误会共用一次自动重试
 * 配额，第二个边界连一次都试不上。
 */
export function identifyCrash(
  error: Error & { digest?: string },
  scope: string,
): CrashIdentity {
  const raw =
    error.digest ?? generateShortHash(`${scope}:${error.name}:${error.message}`);
  return { code: `ERR-${raw}`, fingerprint: `${scope}:${raw}` };
}
