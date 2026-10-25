import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { AgentError } from '../src/contracts/errors.js';
import { readSettings } from '../src/config.js';
import {
  collectLimited,
  readImportMultipart,
  readDownloadedDocument,
  downloadDocument,
  MAX_FILE_BYTES,
} from '../src/document/input.js';
import {
  createModelTransport,
  resolveModelAddresses,
} from '../src/model/transport.js';
import { extractDocument } from '../src/document/extract.js';

const signal = () => new AbortController().signal;
const subCode = (code: string) => (error: unknown) =>
  error instanceof AgentError && error.payload.subCode === code;
const multipart = (body: string) => Readable.from([Buffer.from(body)]);
const config = JSON.stringify({
  apiKey: 'example-key',
  baseUrl: 'https://model.example.com/v1',
  modelName: 'example-model',
});

test('multipart parsing handles every byte split, field order and boundary-like text', async () => {
  const token = 'example-boundary';
  const text = 'Alex Chen\r\n--example-boundary-invalid\nExample Lantern Lab';
  const raw = Buffer.from(
    `--${token}\r\nContent-Disposition: form-data; name="file"; filename="resume.txt"\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${token}\r\nContent-Disposition: form-data; name="config"\r\n\r\n${config}\r\n--${token}--\r\n`,
  );
  for (const width of [1, 2, 7, 64, raw.length]) {
    const chunks = [];
    for (let index = 0; index < raw.length; index += width)
      chunks.push(raw.subarray(index, index + width));
    const value = await readImportMultipart(
      Readable.from(chunks),
      `multipart/form-data; boundary="${token}"`,
      signal(),
    );
    assert.equal(value.config, config);
    assert.equal(value.file?.bytes.toString(), text);
    assert.equal(value.file.format, 'text');
  }
});

test('multipart refuses duplicate fields, ambiguous sources, truncation and excessive field data', async () => {
  const field = (name: string, value: string) =>
    `--example\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const close = '--example--\r\n';
  const file =
    '--example\r\nContent-Disposition: form-data; name="file"; filename="resume.txt"\r\nContent-Type: text/plain\r\n\r\nAlex Chen\r\n';
  for (const raw of [
    field('config', config) + field('config', config) + close,
    file +
      field('sourceUrl', 'https://example.com/resume.txt') +
      field('config', config) +
      close,
    file + field('config', config),
    field('config', 'x'.repeat(32_769)) + close,
    field('unrecognized', 'x') + close,
  ])
    await assert.rejects(
      readImportMultipart(
        multipart(raw),
        'multipart/form-data; boundary=example',
        signal(),
      ),
      subCode('import_request_invalid'),
    );
});

test('file limit accepts exactly 10 MiB and rejects the first excess bytes', async () => {
  const boundary = 'example';
  const begin = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="config"\r\n\r\n${config}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="resume.txt"\r\nContent-Type: text/plain\r\n\r\n`,
  );
  const end = Buffer.from(`\r\n--${boundary}--`);
  const exact = await readImportMultipart(
    Readable.from([begin, Buffer.alloc(MAX_FILE_BYTES, 'a'), end]),
    'multipart/form-data; boundary=example',
    signal(),
  );
  assert.equal(exact.file?.bytes.length, MAX_FILE_BYTES);
  await assert.rejects(
    readImportMultipart(
      Readable.from([begin, Buffer.alloc(MAX_FILE_BYTES + 1, 'a'), end]),
      'multipart/form-data; boundary=example',
      signal(),
    ),
    subCode('document_too_large'),
  );
  let read = 0;
  async function* source() {
    for (let index = 0; index < 10; index++) {
      read++;
      yield Buffer.alloc(64);
    }
  }
  await assert.rejects(
    collectLimited(source(), 100, signal()),
    subCode('document_too_large'),
  );
  assert.equal(read, 2);
});

test('downloaded bodies enforce declared and actual sizes and a strict MIME allowlist', async () => {
  const text = await readFile(
    new URL('./fixtures/resume.txt', import.meta.url),
  );
  const doc = await readDownloadedDocument(
    new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
    signal(),
  );
  assert.deepEqual(doc.bytes, text);
  assert.equal(doc.format, 'text');
  for (const type of [
    'text/html',
    'application/octet-stream',
    'application/zip',
    '',
  ])
    await assert.rejects(
      readDownloadedDocument(
        new Response('body', { headers: { 'Content-Type': type } }),
        signal(),
      ),
      subCode('document_type_unsupported'),
    );
  await assert.rejects(
    readDownloadedDocument(
      new Response('body', {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': String(MAX_FILE_BYTES + 1),
        },
      }),
      signal(),
    ),
    subCode('document_too_large'),
  );
  let consumed = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      consumed++;
      controller.enqueue(new Uint8Array(65_536));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readDownloadedDocument(
      new Response(stream, { headers: { 'Content-Type': 'text/plain' } }),
      signal(),
    ),
    subCode('document_too_large'),
  );
  assert.ok(cancelled);
  assert.ok(consumed <= MAX_FILE_BYTES / 65_536 + 4);
});

test('source policy checks every DNS answer and ignores the model private-host override', async () => {
  const settings = readSettings({
    NODE_ENV: 'test',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
  });
  await assert.rejects(
    downloadDocument(
      'https://documents.example.com/resume.pdf?signature=example',
      settings,
      signal(),
      async () => [
        { address: '1.1.1.1', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    ),
    subCode('source_host_blocked'),
  );
  for (const url of [
    'file:///tmp/resume.pdf',
    'https://user:pass@example.com/resume.pdf',
    'https://example.com/resume.pdf#fragment',
  ])
    await assert.rejects(
      downloadDocument(url, settings, signal()),
      subCode('source_url_invalid'),
    );
  await assert.rejects(
    downloadDocument(
      'https://documents.example.com/resume.pdf',
      settings,
      signal(),
      async () => {
        throw new Error('private detail');
      },
    ),
    subCode('source_dns_failed'),
  );
  const answers = await resolveModelAddresses(
    new URL('https://documents.example.com/resume.pdf?signature=example'),
    false,
    signal(),
    async () => [{ address: '1.1.1.1', family: 4 }],
    'source',
  );
  assert.equal(answers[0].address, '1.1.1.1');
});

test('source transport pins DNS, keeps signed queries and blocks redirects without following', async (t) => {
  const paths: string[] = [];
  const hosts: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url!);
    hosts.push(request.headers.host!);
    if (request.url!.startsWith('/redirect'))
      response.writeHead(302, { Location: '/never-follow' }).end();
    else
      response
        .writeHead(200, { 'Content-Type': 'text/plain' })
        .end('Alex Chen');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://documents.example.com:${address.port}`;
  let lookups = 0;
  // The transport's local opt-in is exercised in isolation; downloadDocument above always disables it.
  const transport = await createModelTransport(
    `${base}/resume.txt?signature=example`,
    true,
    signal(),
    async () => {
      lookups++;
      return [{ address: lookups === 1 ? '127.0.0.1' : '10.0.0.1', family: 4 }];
    },
    1000,
    'source',
  );
  t.after(transport.close);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await transport.fetch(
      `${base}/resume.txt?signature=example`,
    );
    assert.equal(
      (await readDownloadedDocument(response, signal())).bytes.toString(),
      'Alex Chen',
    );
  }
  assert.equal(lookups, 1);
  assert.deepEqual(hosts, [
    `documents.example.com:${address.port}`,
    `documents.example.com:${address.port}`,
  ]);
  await assert.rejects(
    transport.fetch(`${base}/redirect`),
    subCode('source_redirect_blocked'),
  );
  assert.deepEqual(paths, [
    '/resume.txt?signature=example',
    '/resume.txt?signature=example',
    '/redirect',
  ]);
});

test('text decoding, empty documents, malformed archives and extraction cancellation fail explicitly', async () => {
  for (const bytes of [Buffer.from([0xff, 0xfe]), Buffer.from('Alex\0Chen')])
    await assert.rejects(
      extractDocument({ bytes, format: 'text' }, signal()),
      subCode('document_text_invalid'),
    );
  await assert.rejects(
    extractDocument({ bytes: Buffer.from('  '), format: 'markdown' }, signal()),
    subCode('document_empty'),
  );
  await assert.rejects(
    extractDocument(
      { bytes: Buffer.from('x'.repeat(200_001)), format: 'text' },
      signal(),
    ),
    subCode('document_text_too_large'),
  );
  const bytes = await readFile(
    new URL('./fixtures/resume.docx', import.meta.url),
  );
  const index = bytes.indexOf(Buffer.from('504b0102', 'hex'));
  assert.ok(index > 0);
  bytes.writeUInt32LE(20 * 1024 * 1024, index + 24);
  await assert.rejects(
    extractDocument({ bytes, format: 'docx' }, signal()),
    subCode('document_expanded_too_large'),
  );
  const controller = new AbortController();
  const pending = extractDocument(
    {
      bytes: await readFile(new URL('./fixtures/scanned.pdf', import.meta.url)),
      format: 'pdf',
    },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
});

test('PDF text and vision page limits reject complete documents instead of truncating them', async () => {
  for (const [name, code] of [
    ['over-page-limit.pdf', 'pdf_page_limit'],
    ['over-vision-limit.pdf', 'pdf_vision_page_limit'],
  ]) {
    await assert.rejects(
      extractDocument(
        {
          bytes: await readFile(new URL(`./fixtures/${name}`, import.meta.url)),
          format: 'pdf',
        },
        signal(),
      ),
      subCode(code),
    );
  }
});
