/**
 * 输入框里暂存的附件。
 *
 * 此前「选中文件」等于「已经发出去」：文件名当场作为用户消息进对话、解析立刻开跑，
 * 撤不回来。用户既没法先附上再说要干什么，也没法反悔。这一层把「选中」与「发送」
 * 拆开。输入框只负责把附件放入私有 R2；用户发送时再把它和文字交给同一次聊天运行。
 *
 * 这里只有纯函数与类型——UI 在 `AttachmentChips.tsx`，状态在 `Composer.tsx`。
 * 分开是因为「什么格式能收、能拿它做什么」这类规则要能单独测，而它们恰恰是最容易
 * 悄悄说谎的部分（比如给 docx 提供「复刻版式」——那是一个做不到的承诺）。
 */

export type AttachmentKind = 'pdf' | 'image';

export type AttachmentStatus = 'uploading' | 'ready' | 'failed';

export interface StagedAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
  status: AttachmentStatus;
  /** R2 私有对象的 key；只有 ready 的附件有它。 */
  stored?: { key: string; filename: string; contentType: string };
  /** 失败原因。用后端那句具体说明，不是泛化的「解析失败」。 */
  error?: string;
}

/** 上限。与 chat DTO 对齐，避免前端允许选择、发送时才被后端拒绝。 */
export const MAX_ATTACHMENTS = 3;

/** 与 `/api/pdf/parse` 的 `MAX_PDF_BYTES` 对齐——前端先拦一道，省一次白传。 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * 受理的格式。
 *
 * 输入框附件用于给模型看参考版式，因此只接视觉上可忠实呈现的 PDF 和位图。
 * DOCX/Markdown/纯文本没有可复刻的原始页面版式，继续放进来只会制造错误预期。
 */
export const ACCEPTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const EXTENSION_KIND: Record<string, AttachmentKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
};

/** `<input accept>` 用的字符串。扩展名兜底处理浏览器未填 MIME 的情况。 */
export const ACCEPT_ATTR = [
  ...ACCEPTED_MIME,
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
].join(',');

export function kindOf(file: File): AttachmentKind | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const byExtension = EXTENSION_KIND[ext] ?? null;
  // 为空时允许扩展名兜底；浏览器明确报出其它 MIME 时不能被伪装扩展名绕过。
  if (
    file.type &&
    !(ACCEPTED_MIME as readonly string[]).includes(file.type)
  ) {
    return null;
  }
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  return byExtension;
}


/** 加入前的校验。返回错误码而不是文案——文案归 i18n。 */
export type RejectReason = 'unsupported' | 'too-large' | 'too-many' | 'duplicate';

export function validateIncoming(
  file: File,
  existing: StagedAttachment[],
): { ok: true; kind: AttachmentKind } | { ok: false; reason: RejectReason } {
  const kind = kindOf(file);
  if (!kind) return { ok: false, reason: 'unsupported' };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too-large' };
  if (existing.length >= MAX_ATTACHMENTS) return { ok: false, reason: 'too-many' };
  // 同名同大小视为同一个文件。用户重复拖同一份进来多半是手滑，不是真想传两遍。
  if (existing.some((a) => a.file.name === file.name && a.file.size === file.size)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, kind };
}
