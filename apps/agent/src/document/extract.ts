import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AgentError } from '../contracts/errors.js';
import type { DocumentFile } from './input.js';

export const MAX_TEXT_CHARS = 200_000;
export const MAX_PDF_PAGES = 20;
export const MAX_VISION_PAGES = 5;
export type DocumentSource =
  | {
      kind: 'text';
      text: string;
      pageCount?: number;
      pages?: Array<{ number: number; text: string }>;
    }
  | { kind: 'images'; images: string[]; pageCount: number };
export function checkText(text: string): string {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) throw new AgentError(422, 'invalid_input', 'document_empty');
  if (cleaned.length > MAX_TEXT_CHARS)
    throw new AgentError(413, 'invalid_input', 'document_text_too_large');
  if (cleaned.includes('\0'))
    throw new AgentError(422, 'invalid_input', 'document_text_invalid');
  return cleaned;
}
function checkSignature({ bytes, format }: DocumentFile) {
  const valid =
    format === 'pdf'
      ? bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
      : format === 'docx'
        ? bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))
        : format === 'png'
          ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
          : format === 'jpeg'
            ? bytes.length >= 4 &&
              bytes[0] === 0xff &&
              bytes[1] === 0xd8 &&
              bytes[2] === 0xff
            : format === 'webp'
              ? bytes.subarray(0, 4).toString() === 'RIFF' &&
                bytes.subarray(8, 12).toString() === 'WEBP'
              : true;
  if (!valid)
    throw new AgentError(422, 'invalid_input', 'document_content_invalid');
}

export async function extractDocument(
  file: DocumentFile,
  signal: AbortSignal,
): Promise<DocumentSource> {
  signal.throwIfAborted();
  if (!file.bytes.length)
    throw new AgentError(422, 'invalid_input', 'document_empty');
  checkSignature(file);
  if (['png', 'jpeg', 'webp'].includes(file.format))
    return {
      kind: 'images',
      images: [
        `data:image/${file.format};base64,${file.bytes.toString('base64')}`,
      ],
      pageCount: 1,
    };
  if (file.format === 'text' || file.format === 'markdown') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    } catch {
      throw new AgentError(422, 'invalid_input', 'document_text_invalid');
    }
    return { kind: 'text', text: checkText(text) };
  }
  // Isolate document parsing so cancellation and deadlines can stop CPU work too.
  const development = import.meta.url.endsWith('.ts');
  // --input-type applies to an eval/stdin parent, never to a file-based worker.
  const execArgv = process.execArgv.filter(
    (arg, index, args) =>
      !arg.startsWith('--input-type') && args[index - 1] !== '--input-type',
  );
  const url = new URL(
    development ? './extract.worker.ts' : './extract.worker.js',
    import.meta.url,
  );
  const worker = development
    ? new Worker(
        // Constant source; the loader and target arrive as argv, never spliced into code.
        'const [loader, target, parent] = process.argv.slice(-3); import(loader).then(({ tsImport }) => tsImport(target, parent));',
        {
          eval: true,
          argv: [
            pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api'))
              .href,
            url.href,
            import.meta.url,
          ],
          execArgv,
          workerData: file,
          stdout: true,
          stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        },
      )
    : new Worker(url, {
        execArgv,
        workerData: file,
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
  // Libraries may print document metadata in warnings. Never forward worker output to logs.
  worker.stdout?.resume();
  worker.stderr?.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    return await new Promise<DocumentSource>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      timer = setTimeout(
        () =>
          reject(
            new AgentError(422, 'invalid_input', 'document_extraction_timeout'),
          ),
        60_000,
      );
      timer.unref();
      worker.once('error', () =>
        reject(
          new AgentError(422, 'invalid_input', 'document_content_invalid'),
        ),
      );
      worker.once('exit', () =>
        reject(
          new AgentError(422, 'invalid_input', 'document_content_invalid'),
        ),
      );
      worker.once(
        'message',
        (value: {
          source?: DocumentSource;
          error?: { status: number; subCode: string };
        }) => {
          if (value.source) resolve(value.source);
          else
            reject(
              new AgentError(
                value.error?.status ?? 422,
                'invalid_input',
                value.error?.subCode ?? 'document_content_invalid',
              ),
            );
        },
      );
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    await worker.terminate();
  }
}
