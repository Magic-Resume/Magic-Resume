import QRCode from 'qrcode';

/**
 * 底图上那块预留的白色二维码位。
 *
 * 存**归一化比例**而不是像素：底图重画一版、尺寸变了，只要版式一致这些数就还成立。
 * 实测自 `public/invite/poster.webp`（941×1672）——白框在 x 610–762、y 1263–1413。
 */
export const POSTER_QR_SLOT = {
  left: 610 / 941,
  top: 1263 / 1672,
  size: 153 / 941,
} as const;

/**
 * 二维码在白框里再往内收的比例。
 *
 * 这就是 quiet zone：码四周必须留白才扫得稳，紧贴边框的码在很多相机上直接识别不了。
 * 白框本身已经是白的，所以内收出来的边自然成为静默区，不用额外画。
 */
const QUIET_ZONE = 0.09;

export const POSTER_SRC = '/invite/poster.webp';

/**
 * 邀请码缓存在本地。
 *
 * 一个用户的码是**永不变化**的常量（服务端 `ensureCode` 只在首次生成，之后一直返回
 * 同一个），所以第二次开弹窗完全没必要再等一次网络往返——那正是"要转一会儿"的来源，
 * 合成本身只有几十毫秒。仍然照常发请求做后台校正，只是不再阻塞首屏。
 */
const CODE_KEY = 'magic:referral-code';

export const cachedInviteCode = (): string | null => {
  try {
    return window.localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
};

export const rememberInviteCode = (code: string): void => {
  try {
    window.localStorage.setItem(CODE_KEY, code);
  } catch {
    // 隐私模式下存不下：只是回到每次都请求，不影响正确性。
  }
};

/** 同一会话内合成过的成品。缓存 Blob 而不是 objectURL——URL 的生命周期归调用方管。 */
const composed = new Map<string, Blob>();

/**
 * 预热：把首次打开要等的两件事提前做掉。
 *
 * 挂在 header 那颗按钮的 hover / focus 上——鼠标移上去到真的点下去之间有几百毫秒，
 * 足够把码取回来、把底图下载好。与 `preloadResumePdfExport` 是同一套路子。
 *
 * 不在页面加载时预热：取码会**惰性生成**邀请码，那等于给每个打开过 dashboard 的人
 * 都发一个码，而绝大多数人永远不会点这个按钮。hover 才是真实的意图信号。
 */
export async function warmInvitePoster(): Promise<void> {
  const img = new Image();
  img.src = POSTER_SRC;
  if (cachedInviteCode()) return;
  try {
    const res = await fetch('/api/billing/referrals/me', { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const code = (json?.data ?? json)?.code;
    if (code) rememberInviteCode(code);
  } catch {
    // 预热失败无所谓，正常路径会再取一次。
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`poster background failed to load: ${src}`));
    img.src = src;
  });

/**
 * 把邀请链接的二维码画进海报，产出一张可保存 / 可转发的 PNG。
 *
 * 只叠二维码，不叠文字——底图里的中文是生成时就烤好的，且渲染得干净。真到了要出
 * 英文版的那天，换一张对应的底图即可，这里一行不用改。
 *
 * 在客户端合成而不是服务端：这张图完全由一个短链决定，没有任何需要服务端才知道的
 * 东西；放服务端等于为一件浏览器能做的事新增一条渲染链路和一份存储。
 */
export async function composeInvitePoster(inviteUrl: string): Promise<Blob> {
  const hit = composed.get(inviteUrl);
  if (hit) return hit;

  const bg = await loadImage(POSTER_SRC);
  const canvas = document.createElement('canvas');
  canvas.width = bg.naturalWidth;
  canvas.height = bg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bg, 0, 0);

  const slot = POSTER_QR_SLOT.size * canvas.width;
  const inset = slot * QUIET_ZONE;
  const qrSize = Math.round(slot - inset * 2);

  // 先把码画在自己的离屏画布上再贴过去：直接往主画布上画会让 qrcode 覆盖整张画布的
  // 尺寸设置。margin: 0 是因为静默区由上面的 inset 提供，库再加一圈会让码更小、更难扫。
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, inviteUrl, {
    width: qrSize,
    margin: 0,
    color: { dark: '#0A0A0A', light: '#FFFFFF' },
    // 纠错等级 M：朋友圈会二次压缩，L 在压缩后容易扫不出；再高会让码更密、模块更小，
    // 在这块 153px 的位置上反而更难扫。
    errorCorrectionLevel: 'M',
  });

  ctx.drawImage(
    qrCanvas,
    Math.round(POSTER_QR_SLOT.left * canvas.width + inset),
    Math.round(POSTER_QR_SLOT.top * canvas.height + inset),
    qrSize,
    qrSize
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('canvas.toBlob returned null');
  composed.set(inviteUrl, blob);
  return blob;
}

/** 邀请链接。`/i/{code}` 短到二维码模块大、好扫，也短到能口头念出来。 */
export const buildInviteUrl = (code: string): string =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}/i/${code}`;
