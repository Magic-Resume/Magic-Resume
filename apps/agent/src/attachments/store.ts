import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Settings } from '../config.js';
import { AgentError } from '../contracts/errors.js';
import { MAX_FILE_BYTES, type DocumentFile } from '../document/input.js';
import {
  ATTACHMENT_TYPES,
  cleanAttachmentName,
  sniffAttachment,
} from '../document/attachment-type.js';

export const attachmentKey = z.string().regex(/^[a-f0-9]{64}$/);
const metadataSchema = z.object({
  key: attachmentKey,
  filename: z.string().min(1).max(180),
  format: z.enum(['pdf', 'png', 'jpeg', 'webp']),
  createdAt: z.number().finite().positive(),
});
export type AttachmentMetadata = z.infer<typeof metadataSchema> & {
  contentType: string;
};
const READ_PATH = '/api/uploads/attachment/';
const READ_URL_SECONDS = 15 * 60;

export class AttachmentStore {
  readonly directory: string;
  private readonly secret: string | Buffer;
  constructor(private readonly settings: Settings) {
    this.directory = join(settings.dataDir, 'attachments');
    this.secret = settings.attachmentSecret ?? randomBytes(32);
  }
  private path(key: string, suffix: string) {
    if (!attachmentKey.safeParse(key).success)
      throw new AgentError(400, 'invalid_input', 'attachment_key_invalid');
    return join(this.directory, `${key}.${suffix}`);
  }
  async save(file: DocumentFile, filename: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (file.bytes.length > MAX_FILE_BYTES)
      throw new AgentError(413, 'invalid_input', 'attachment_too_large');
    const format = sniffAttachment(file.bytes);
    const key = randomBytes(32).toString('hex');
    const meta = {
      key,
      filename: cleanAttachmentName(filename),
      format,
      createdAt: Date.now(),
    };
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // Metadata is the commit marker. A cancelled write can never expose a partial file.
    try {
      await writeFile(this.path(key, 'bin'), file.bytes, {
        flag: 'wx',
        mode: 0o600,
        signal,
      });
      await writeFile(this.path(key, 'pending'), JSON.stringify(meta), {
        flag: 'wx',
        mode: 0o600,
        signal,
      });
      signal.throwIfAborted();
      await rename(this.path(key, 'pending'), this.path(key, 'json'));
    } catch (error) {
      await this.remove(key);
      throw error;
    }
    return {
      key,
      filename: meta.filename,
      contentType: ATTACHMENT_TYPES[format],
    };
  }
  async metadata(key: string, now = Date.now()): Promise<AttachmentMetadata> {
    const path = this.path(key, 'json');
    let meta: z.infer<typeof metadataSchema>;
    try {
      meta = metadataSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      if (meta.key !== key) throw new Error('Invalid attachment metadata');
    } catch {
      throw new AgentError(404, 'not_found', 'attachment_not_found');
    }
    if (meta.createdAt + this.settings.attachmentTtlHours * 3_600_000 <= now)
      throw new AgentError(410, 'invalid_input', 'attachment_expired');
    return { ...meta, contentType: ATTACHMENT_TYPES[meta.format] };
  }
  async read(key: string, signal: AbortSignal) {
    const meta = await this.metadata(key);
    signal.throwIfAborted();
    const handle = await open(
      this.path(key, 'bin'),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    ).catch(() => {
      throw new AgentError(404, 'not_found', 'attachment_not_found');
    });
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_FILE_BYTES)
        throw new AgentError(413, 'invalid_input', 'attachment_too_large');
      const bytes = await handle.readFile({ signal });
      if (sniffAttachment(bytes) !== meta.format)
        throw new AgentError(
          422,
          'invalid_input',
          'attachment_content_invalid',
        );
      return { meta, file: { bytes, format: meta.format } };
    } finally {
      await handle.close();
    }
  }
  private signature(url: URL, expires: string) {
    return createHmac('sha256', this.secret)
      .update(`${url.origin}${url.pathname}\n${expires}`)
      .digest('base64url');
  }
  async readUrl(key: string, origin: string, now = Date.now()) {
    const meta = await this.metadata(key, now);
    const expires = String(
      Math.floor(
        Math.min(
          now + READ_URL_SECONDS * 1000,
          meta.createdAt + this.settings.attachmentTtlHours * 3_600_000,
        ) / 1000,
      ),
    );
    const url = new URL(`${READ_PATH}${key}`, origin);
    url.searchParams.set('expires', expires);
    url.searchParams.set('signature', this.signature(url, expires));
    return {
      url: url.href,
      expiresAt: new Date(Number(expires) * 1000).toISOString(),
    };
  }
  /** Reserved read paths always validate locally, including invalid/expired URLs; never fall back to HTTP. */
  localKey(sourceUrl: string, now = Date.now()): string | undefined {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      throw new AgentError(400, 'invalid_input', 'source_url_invalid');
    }
    if (!url.pathname.startsWith(READ_PATH)) return undefined;
    const invalid = () =>
      new AgentError(403, 'invalid_input', 'attachment_signature_invalid');
    const key = url.pathname.slice(READ_PATH.length);
    const expires = url.searchParams.get('expires') ?? '';
    const signature = url.searchParams.get('signature') ?? '';
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      !attachmentKey.safeParse(key).success ||
      !/^\d{1,13}$/.test(expires) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
      [...url.searchParams.keys()].length !== 2 ||
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(this.signature(url, expires)),
      )
    )
      throw invalid();
    if (Number(expires) * 1000 <= now)
      throw new AgentError(410, 'invalid_input', 'attachment_url_expired');
    return key;
  }
  private async remove(key: string) {
    await Promise.all(
      ['bin', 'json', 'pending'].map((suffix) =>
        rm(this.path(key, suffix), { force: true }),
      ),
    );
  }
  async collectExpired(now = Date.now()) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const keys = new Set(
      (await readdir(this.directory)).flatMap(
        (entry) =>
          /^([a-f0-9]{64})\.(bin|json|pending)$/.exec(entry)?.[1] ?? [],
      ),
    );
    let count = 0;
    for (const key of keys) {
      try {
        await this.metadata(key, now);
      } catch (error) {
        if (
          error instanceof AgentError &&
          error.payload.subCode === 'attachment_expired'
        ) {
          await this.remove(key);
          count++;
        } else {
          // Recover orphaned uploads only after a grace period, never during an active write.
          const info = await stat(this.path(key, 'bin')).catch(() => undefined);
          if (info && info.mtimeMs < now - 3_600_000) {
            await this.remove(key);
            count++;
          }
        }
      }
    }
    return count;
  }
}
