import { parentPort, workerData } from 'node:worker_threads';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { AgentError } from '../contracts/errors.js';
import {
  checkText,
  MAX_PDF_PAGES,
  MAX_VISION_PAGES,
  MAX_TEXT_CHARS,
  type DocumentSource,
} from './extract.js';
import type { DocumentFile } from './input.js';

function checkDocxArchive(bytes: Buffer) {
  // Enforce expanded-size bounds before Mammoth decompresses any archive entry.
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset--
  )
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    throw new Error('Invalid archive');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count > 2048 ||
    offset + directorySize !== end ||
    bytes.readUInt16LE(end + 8) !== count
  )
    throw new Error('Invalid archive');
  let expanded = 0;
  let document = false;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Invalid archive');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      local + 30 >= end ||
      compressed > bytes.length ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw new Error('Invalid archive');
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (
      names.has(name) ||
      name.startsWith('/') ||
      name.split(/[\\/]/).includes('..')
    )
      throw new Error('Invalid archive');
    names.add(name);
    expanded += size;
    if (size > 10 * 1024 * 1024 || expanded > 32 * 1024 * 1024)
      throw new AgentError(413, 'invalid_input', 'document_expanded_too_large');
    document ||= name === 'word/document.xml';
    offset = next;
  }
  if (!document || offset !== end) throw new Error('Invalid archive');
}
async function extractPdf(bytes: Buffer): Promise<DocumentSource> {
  const parser = new PDFParse({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    maxImageSize: 16_000_000,
    verbosity: 0,
  });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    if (!info.total || info.total > MAX_PDF_PAGES)
      throw new AgentError(413, 'invalid_input', 'pdf_page_limit');
    let text = '';
    const pages: Array<{ number: number; text: string }> = [];
    let needsVision = false;
    for (let number = 1; number <= info.total; number++) {
      const page = await parser.getText({ partial: [number], pageJoiner: '' });
      const content = page.pages[0]?.text ?? '';
      pages.push({ number, text: content });
      const letters = content.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
      const unreadable =
        (content.match(/\uFFFD/g)?.length ?? 0) >
        Math.max(5, content.length / 20);
      needsVision ||= letters < 40 || unreadable;
      text += `${content}\n`;
      if (text.length > MAX_TEXT_CHARS)
        throw new AgentError(413, 'invalid_input', 'document_text_too_large');
    }
    needsVision ||= (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 120;
    if (!needsVision)
      return {
        kind: 'text',
        text: checkText(text),
        pageCount: info.total,
        pages,
      };
    if (info.total > MAX_VISION_PAGES)
      throw new AgentError(413, 'invalid_input', 'pdf_vision_page_limit');
    const images: string[] = [];
    let imageBytes = 0;
    for (let number = 1; number <= info.total; number++) {
      const page = info.pages[number - 1];
      if (
        !page ||
        !Number.isFinite(page.width) ||
        !Number.isFinite(page.height) ||
        page.width <= 0 ||
        page.height <= 0 ||
        page.width > 14_400 ||
        page.height > 14_400 ||
        page.width / page.height > 8 ||
        page.height / page.width > 8
      )
        throw new AgentError(
          422,
          'invalid_input',
          'pdf_page_dimensions_invalid',
        );
      const desiredWidth = Math.min(
        1400,
        Math.floor((2200 * page.width) / page.height),
      );
      const rendered = await parser.getScreenshot({
        partial: [number],
        desiredWidth,
        imageDataUrl: false,
        imageBuffer: true,
      });
      const image = rendered.pages[0];
      if (!image?.data.length) throw new Error('Rendering failed');
      imageBytes += image.data.length;
      if (imageBytes > 10 * 1024 * 1024)
        throw new AgentError(413, 'invalid_input', 'document_images_too_large');
      images.push(
        `data:image/png;base64,${Buffer.from(image.data).toString('base64')}`,
      );
    }
    return { kind: 'images', images, pageCount: info.total };
  } finally {
    await parser.destroy();
  }
}
async function run() {
  const input = workerData as DocumentFile;
  const bytes = Buffer.from(input.bytes);
  if (input.format === 'pdf') return extractPdf(bytes);
  checkDocxArchive(bytes);
  const result = await mammoth.extractRawText({ buffer: bytes });
  return { kind: 'text' as const, text: checkText(result.value) };
}
try {
  parentPort!.postMessage({ source: await run() });
} catch (error) {
  parentPort!.postMessage({
    error:
      error instanceof AgentError
        ? { status: error.status, subCode: error.payload.subCode }
        : { status: 422, subCode: 'document_content_invalid' },
  });
}
