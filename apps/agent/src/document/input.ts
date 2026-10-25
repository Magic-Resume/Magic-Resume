import { Readable } from 'node:stream';
import type { Settings } from '../config.js';
import { AgentError } from '../contracts/errors.js';
import { parseModelConfig } from '../contracts/model-config.js';
import {
  createModelTransport,
  type ModelResolver,
} from '../model/transport.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 65_536;
export type DocumentFormat =
  'pdf' | 'docx' | 'png' | 'jpeg' | 'webp' | 'markdown' | 'text';
export interface DocumentFile {
  bytes: Buffer;
  format: DocumentFormat;
}
const contentTypes: Record<string, DocumentFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'text/markdown': 'markdown',
  'text/plain': 'text',
};
const extensions: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  md: 'markdown',
  txt: 'text',
};
export function documentFormat(
  type: string,
  filename?: string,
): DocumentFormat {
  const mime = type.split(';')[0].trim().toLowerCase();
  const format =
    contentTypes[mime] ??
    ((!mime || mime === 'application/octet-stream') && filename
      ? extensions[filename.split('.').at(-1)!.toLowerCase()]
      : undefined);
  if (!format)
    throw new AgentError(415, 'invalid_input', 'document_type_unsupported');
  return format;
}
const invalid = () =>
  new AgentError(400, 'invalid_input', 'import_request_invalid');
const tooLarge = () =>
  new AgentError(413, 'invalid_input', 'document_too_large');

/** Consume at most the permitted bytes; do not buffer an unbounded upload or download first. */
export async function collectLimited(
  stream: AsyncIterable<Uint8Array>,
  limit: number,
  signal: AbortSignal,
) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    signal.throwIfAborted();
    size += chunk.byteLength;
    if (size > limit) throw tooLarge();
    chunks.push(Buffer.from(chunk));
  }
  signal.throwIfAborted();
  return Buffer.concat(chunks, size);
}

interface MultipartValue {
  file?: DocumentFile;
  config?: string;
  sourceUrl?: string;
}
/** A bounded multipart reader. Only the three import fields are accepted; files never reach disk. */
export async function readImportMultipart(
  stream: Readable,
  type: string,
  signal: AbortSignal,
): Promise<MultipartValue> {
  const boundary = /(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(type);
  const token = boundary?.[1] ?? boundary?.[2];
  if (!token || token.length > 70 || !/^[\w'()+,\-./:=? ]+$/.test(token))
    throw invalid();
  const start = Buffer.from(`--${token}\r\n`);
  const delimiter = Buffer.from(`\r\n--${token}`);
  const result: MultipartValue = {};
  const seen = new Set<string>();
  let buffer = Buffer.alloc(0);
  let state: 'start' | 'headers' | 'body' | 'end' = 'start';
  let total = 0;
  let current: {
    name: 'file' | 'config' | 'sourceUrl';
    format?: DocumentFormat;
    size: number;
    chunks: Buffer[];
  };
  const append = (data: Buffer) => {
    const limit =
      current.name === 'file'
        ? MAX_FILE_BYTES
        : current.name === 'config'
          ? 32_768
          : 8192;
    current.size += data.length;
    if (current.size > limit)
      throw current.name === 'file' ? tooLarge() : invalid();
    if (data.length) current.chunks.push(Buffer.from(data));
  };
  const finish = () => {
    const bytes = Buffer.concat(current.chunks, current.size);
    if (current.name === 'file')
      result.file = { bytes, format: current.format! };
    else {
      try {
        result[current.name] = new TextDecoder('utf-8', { fatal: true }).decode(
          bytes,
        );
      } catch {
        throw invalid();
      }
    }
  };
  // Do not destroy IncomingMessage on a limit error: the route still needs to send 413.
  for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
    signal.throwIfAborted();
    total += chunk.length;
    if (total > MAX_MULTIPART_BYTES) throw tooLarge();
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (state === 'start') {
        if (buffer.length < start.length) break;
        if (!buffer.subarray(0, start.length).equals(start)) throw invalid();
        buffer = buffer.subarray(start.length);
        state = 'headers';
      } else if (state === 'headers') {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) {
          if (buffer.length > 8192) throw invalid();
          break;
        }
        if (end > 8192) throw invalid();
        const headers = new Map<string, string>();
        for (const line of buffer
          .subarray(0, end)
          .toString('latin1')
          .split('\r\n')) {
          const split = line.indexOf(':');
          if (split < 1) throw invalid();
          const key = line.slice(0, split).toLowerCase();
          if (headers.has(key)) throw invalid();
          headers.set(key, line.slice(split + 1).trim());
        }
        const disposition = headers.get('content-disposition') ?? '';
        const name = /(?:^|;)\s*name="([^"\r\n]+)"/i.exec(disposition)?.[1];
        const filename = /(?:^|;)\s*filename="([^"\r\n]*)"/i.exec(
          disposition,
        )?.[1];
        if (
          !/^form-data\s*;/i.test(disposition) ||
          !name ||
          !['file', 'config', 'sourceUrl'].includes(name) ||
          seen.has(name) ||
          headers.has('content-transfer-encoding')
        )
          throw invalid();
        if (name !== 'file' && filename !== undefined) throw invalid();
        seen.add(name);
        current = {
          name: name as typeof current.name,
          size: 0,
          chunks: [],
          ...(name === 'file'
            ? {
                format: documentFormat(
                  headers.get('content-type') ?? '',
                  filename,
                ),
              }
            : {}),
        };
        buffer = buffer.subarray(end + 4);
        state = 'body';
      } else if (state === 'body') {
        let at = buffer.indexOf(delimiter);
        while (at >= 0 && buffer.length >= at + delimiter.length + 2) {
          const suffix = buffer
            .subarray(at + delimiter.length, at + delimiter.length + 2)
            .toString();
          if (suffix === '\r\n' || suffix === '--') break;
          at = buffer.indexOf(delimiter, at + 1);
        }
        if (at < 0 || buffer.length < at + delimiter.length + 2) {
          const safe = Math.max(
            0,
            at >= 0 ? at : buffer.length - delimiter.length - 1,
          );
          append(buffer.subarray(0, safe));
          buffer = buffer.subarray(safe);
          break;
        }
        append(buffer.subarray(0, at));
        finish();
        const suffix = buffer
          .subarray(at + delimiter.length, at + delimiter.length + 2)
          .toString();
        buffer = buffer.subarray(at + delimiter.length + 2);
        state = suffix === '--' ? 'end' : 'headers';
      } else {
        if (
          buffer.length > 2 ||
          (buffer.length === 2 && buffer.toString() !== '\r\n')
        )
          throw invalid();
        break;
      }
    }
  }
  signal.throwIfAborted();
  if (
    state !== 'end' ||
    !result.config ||
    Boolean(result.file) === Boolean(result.sourceUrl?.trim())
  )
    throw invalid();
  return result;
}

export function parseImportFields(body: unknown) {
  if (!body || typeof body !== 'object') throw invalid();
  const values = body as Record<string, unknown>;
  if (typeof values.config !== 'string' || values.config.length > 32_768)
    throw invalid();
  let raw: unknown;
  try {
    raw = JSON.parse(values.config);
  } catch {
    throw new AgentError(400, 'misconfigured', 'model_config_invalid');
  }
  const config = parseModelConfig(raw);
  const sourceUrl = values.sourceUrl;
  if (
    sourceUrl !== undefined &&
    (typeof sourceUrl !== 'string' ||
      !sourceUrl.trim() ||
      sourceUrl.length > 8192)
  )
    throw invalid();
  return {
    config,
    sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.trim() : undefined,
  };
}

export async function downloadDocument(
  sourceUrl: string,
  settings: Settings,
  signal: AbortSignal,
  resolver?: ModelResolver,
): Promise<DocumentFile> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw invalid();
  }
  // Even a local model opt-in cannot authorize private document downloads.
  const transport = await createModelTransport(
    url.href,
    false,
    signal,
    resolver,
    settings.idleTimeoutMs,
    'source',
  );
  let response: Response | undefined;
  try {
    response = await transport.fetch(url, {
      signal,
      headers: { Accept: Object.keys(contentTypes).join(', ') },
    });
    return await readDownloadedDocument(response, signal);
  } finally {
    await response?.body?.cancel().catch(() => {});
    await transport.close();
  }
}

export async function readDownloadedDocument(
  response: Response,
  signal: AbortSignal,
): Promise<DocumentFile> {
  if (!response.ok)
    throw new AgentError(400, 'invalid_input', 'source_download_failed');
  const format = documentFormat(response.headers.get('content-type') ?? '');
  const declared = response.headers.get('content-length');
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_FILE_BYTES)
  )
    throw tooLarge();
  if (!response.body)
    throw new AgentError(422, 'invalid_input', 'document_empty');
  const bytes = await collectLimited(
    Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream<Uint8Array>,
    ),
    MAX_FILE_BYTES,
    signal,
  );
  return { bytes, format };
}
