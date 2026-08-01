import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getServerUserId } from '@/lib/auth/server';
import {
  getR2Client,
  isR2Configured,
  ownAvatarKeyFromUrl,
  publicUrlForKey,
  R2_BUCKET,
} from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 客户端把头像压到 ~120KB JPEG;服务端上限贴合实际产出留足余量即可(512KB),
// 砍掉「绕过前端直接 POST 大文件」的放大空间(此前 2MB=16 倍太宽)。
const MAX_AVATAR_BYTES = 512 * 1024;

/** 每个用户每分钟最多上传次数(进程内软限流,防刷 Class A 操作)。 */
const RATE_LIMIT_PER_MINUTE = 20;
const rateBuckets = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (rateBuckets.get(userId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(userId, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(userId, hits);
  return false;
}

/** 魔数嗅探:只认真正的位图,SVG / 其它一律拒绝(防 XSS / polyglot)。 */
function sniffImage(buf: Uint8Array): { ext: string; contentType: string } | null {
  const b = buf;
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  // GIF: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { ext: 'gif', contentType: 'image/gif' };
  }
  // WEBP: RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isR2Configured()) {
      // 密钥没配好时明确报可用性问题,而不是 500 崩栈。
      return NextResponse.json({ error: 'Avatar upload is not configured' }, { status: 503 });
    }

    if (rateLimited(userId)) {
      return NextResponse.json({ error: 'Too many uploads, slow down' }, { status: 429 });
    }

    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_AVATAR_BYTES + 256 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const prevUrl = typeof form.get('prevUrl') === 'string' ? (form.get('prevUrl') as string) : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 415 });
    }

    // 每用户固定 key:上传即覆盖 → 存储硬封顶在「每人恒 1 个对象」,即便有人绕过前端
    // 疯狂上传也堆不出量(防盗刷占存储)。固定扩展名 .jpg 保证不因格式不同产生第二个对象;
    // 真实 Content-Type 仍按嗅探设置(浏览器按 Content-Type 而非扩展名解析)。
    const key = `avatars/${userId}.jpg`;
    const client = getR2Client();

    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: kind.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    // 固定 key 会命中 CDN/浏览器缓存,靠 ?v=<ts> 破缓存拿到新图。
    const url = `${publicUrlForKey(key)}?v=${Date.now()}`;

    // 过渡期清理:旧方案(avatars/<userId>/<nanoid>.ext)残留对象,借 prevUrl 尽力删掉。
    // 仅删自己前缀下的、且非当前固定 key。失败不影响上传结果。
    const oldKey = ownAvatarKeyFromUrl(prevUrl, userId);
    if (oldKey && oldKey !== key) {
      client
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey }))
        .catch(() => undefined);
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[avatar-upload] failed', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
