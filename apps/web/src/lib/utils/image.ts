/**
 * 客户端头像图片预处理 —— 在上传 / 内嵌前先在浏览器里把图压小。
 *
 * 输出 JPEG(不是 webp):头像是照片,JPEG 体积和 webp 接近(~几十 KB),而且
 * react-pdf 原生支持 JPEG —— webp 会让 PDF 渲染报 "Base64 image invalid format: webp"。
 *
 *  - 统一缩到 ≤512px、转 JPEG,循环降质直到 ≤ maxBytes(默认 ~120KB);
 *  - self-hosted 直接拿 dataUrl 内嵌进简历 JSON,不落任何后端;
 *  - cloud 拿 blob 传到 R2,单张只占几十 KB,存储与流量都可忽略。
 */

/** 允许的输入图片类型(魔数/扩展兜底由服务端再校验一次)。SVG 一律拒绝(XSS)。 */
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const ACCEPTED_IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',');

export type CompressedImage = {
  /** JPEG 编码后的二进制,用于上传 R2 */
  blob: Blob;
  /** data:image/jpeg;base64,... —— 用于 self-hosted 内嵌 */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

export type CompressOptions = {
  /** 最长边像素上限 */
  maxDimension?: number;
  /** 目标字节上限,超了就继续降质/降尺寸 */
  maxBytes?: number;
  /** 起始 JPEG 质量 */
  quality?: number;
};

const DEFAULTS = {
  maxDimension: 512,
  maxBytes: 120 * 1024,
  quality: 0.9,
} satisfies Required<CompressOptions>;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('CANVAS_ENCODE_FAILED'))),
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('BLOB_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

function drawScaled(img: HTMLImageElement, maxDimension: number) {
  const ratio = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  // JPEG 无 alpha:先铺白底,否则透明 PNG 的透明区在 JPEG 里会变黑。
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
}

/**
 * 把用户选的图压成受控大小的 JPEG。
 * 先按 maxDimension 缩放,再从 quality 起逐档降质;若最低质量仍超 maxBytes,
 * 就把尺寸再砍一半重试,直到达标或到最小尺寸。
 */
export async function compressAvatarImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const { maxDimension, maxBytes, quality } = { ...DEFAULTS, ...options };

  const img = await loadImage(file);

  let dimension = maxDimension;
  let best: Blob | null = null;

  // 外层:尺寸阶梯(512 → 384 → …),内层:质量阶梯。取第一个 ≤ maxBytes 的结果。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { canvas } = drawScaled(img, dimension);
    for (let q = quality; q >= 0.4; q -= 0.15) {
      const blob = await canvasToJpegBlob(canvas, q);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) {
        const dataUrl = await blobToDataUrl(blob);
        return {
          blob,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          bytes: blob.size,
        };
      }
    }
    dimension = Math.round(dimension * 0.75);
    if (dimension < 96) break;
  }

  // 兜底:即使没压到目标也返回当前最小的(极端图),服务端还有硬上限拦截。
  const fallback = best ?? (await canvasToJpegBlob(drawScaled(img, dimension).canvas, 0.4));
  const dataUrl = await blobToDataUrl(fallback);
  return {
    blob: fallback,
    dataUrl,
    width: 0,
    height: 0,
    bytes: fallback.size,
  };
}
