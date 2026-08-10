import QRCode from 'qrcode';

/**
 * 底图上那块预留的白色二维码位。
 *
 * 存**归一化比例**而不是像素：底图重画一版、尺寸变了，只要版式一致这些数就还成立。
 * 实测自 `public/invite/poster.png`（941×1672）——白框在 x 610–762、y 1263–1413。
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

export const POSTER_SRC = '/invite/poster.png';

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
  return blob;
}

/** 邀请链接。`/i/{code}` 短到二维码模块大、好扫，也短到能口头念出来。 */
export const buildInviteUrl = (code: string): string =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}/i/${code}`;
