import { AgentError } from '../contracts/errors.js';

export const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;
export type AttachmentFormat = keyof typeof ATTACHMENT_TYPES;

/** Derive the type from bytes, never from a browser label or a filename. */
export function sniffAttachment(bytes: Buffer): AttachmentFormat {
  if (
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.subarray(12, 16).toString() === 'IHDR'
  )
    return 'png';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'jpeg';
  if (
    bytes.length >= 16 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString())
  )
    return 'webp';
  if (/^%PDF-\d\.\d/.test(bytes.subarray(0, 16).toString('latin1')))
    return 'pdf';
  throw new AgentError(415, 'invalid_input', 'attachment_type_unsupported');
}

export function cleanAttachmentName(name: string): string {
  return (
    name
      .normalize('NFKC')
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[\p{C}<>:"/\\|?*]/gu, '_')
      .replace(/^\.+/, '')
      .trim()
      .slice(0, 180) || 'attachment'
  );
}
