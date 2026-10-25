import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture, frames } from './helpers.js';
import { AttachmentStore } from '../src/attachments/store.js';
import {
  createAttachmentContext,
  prepareAttachments,
} from '../src/attachments/context.js';
import {
  MAX_FILE_BYTES,
  readAttachmentMultipart,
} from '../src/document/input.js';
import { Persistence } from '../src/persistence/store.js';
import { AgentError } from '../src/contracts/errors.js';
import { HumanMessage } from '@langchain/core/messages';
import { captureCustom } from './middleware-helpers.js';
import type { ChatRequest } from '../src/contracts/requests.js';

const signal = () => new AbortController().signal;
const subCode = (code: string) => (error: unknown) =>
  error instanceof AgentError && error.payload.subCode === code;
const fileBytes = (name: string) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url));
async function upload(
  origin: string,
  filename = 'resume.pdf',
  type = 'application/pdf',
  bytes?: Buffer,
) {
  const form = new FormData();
  form.set(
    'file',
    new Blob([new Uint8Array(bytes ?? (await fileBytes(filename)))], { type }),
    filename,
  );
  return fetch(`${origin}/api/uploads/attachment`, {
    method: 'POST',
    body: form,
  });
}
async function attachment(
  f: Awaited<ReturnType<typeof fixture>>,
  filename = 'resume.pdf',
  type = 'application/pdf',
) {
  const response = await upload(f.origin, filename, type);
  assert.equal(response.status, 200, await response.clone().text());
  const stored = (await response.json()).data as {
    key: string;
    filename: string;
    contentType: NonNullable<ChatRequest['attachments']>[number]['contentType'];
  };
  const readUrl = await f.post('/api/uploads/attachment/read-url', {
    key: stored.key,
  });
  assert.equal(readUrl.status, 200);
  return {
    ...stored,
    sourceUrl: (await readUrl.json()).data.url as string,
    id: 'example-attachment',
    name: stored.filename,
  };
}

test('uploads sniff all four formats, clean names and ignore disguised extensions and MIME labels', async (t) => {
  const f = await fixture(t);
  for (const [name, type] of [
    ['resume.pdf', 'application/pdf'],
    ['resume.png', 'image/png'],
    ['resume.jpeg', 'image/jpeg'],
    ['resume.webp', 'image/webp'],
  ]) {
    const bytes = await fileBytes(name);
    const response = await upload(
      f.origin,
      '../../example.exe',
      'text/plain',
      bytes,
    );
    assert.equal(response.status, 200, await response.clone().text());
    const stored = (await response.json()).data;
    assert.match(stored.key, /^[a-f0-9]{64}$/);
    assert.equal(stored.filename, 'example.exe');
    assert.equal(stored.contentType, type);
    const signed = await f.post('/api/uploads/attachment/read-url', {
      key: stored.key,
    });
    const { url, expiresAt } = (await signed.json()).data;
    assert.ok(Date.parse(expiresAt) - Date.now() <= 900_000);
    assert.ok(Date.parse(expiresAt) - Date.now() > 890_000);
    const read = await fetch(url);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('content-type'), type);
    assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), bytes);
  }
  for (const name of ['resume.pdf', 'resume.png', 'resume.webp']) {
    const response = await upload(
      f.origin,
      name,
      'application/pdf',
      Buffer.from('<html>not a document</html>'),
    );
    assert.equal(response.status, 415);
    assert.equal(
      (await response.json()).subCode,
      'attachment_type_unsupported',
    );
  }
  assert.equal(
    (await f.post('/api/uploads/attachment/read-url', { key: '../example' }))
      .status,
    400,
  );
  assert.equal(
    (await f.post('/api/uploads/attachment/read-url', { key: 'a'.repeat(64) }))
      .status,
    404,
  );
  const unicode = await upload(
    f.origin,
    '示例附件.pdf',
    'application/pdf',
    await fileBytes('resume.pdf'),
  );
  assert.equal((await unicode.json()).data.filename, '示例附件.pdf');
});

test('attachment multipart handles byte splits and rejects other or duplicate fields', async () => {
  const bytes = await fileBytes('resume.png');
  const raw = Buffer.concat([
    Buffer.from(
      '--example\r\nContent-Disposition: form-data; name="file"; filename="image.pdf"\r\nContent-Type: application/pdf\r\n\r\n',
    ),
    bytes,
    Buffer.from('\r\n--example--\r\n'),
  ]);
  for (const width of [1, 7, raw.length]) {
    const chunks = [];
    for (let i = 0; i < raw.length; i += width)
      chunks.push(raw.subarray(i, i + width));
    const file = await readAttachmentMultipart(
      Readable.from(chunks),
      'multipart/form-data; boundary=example',
      signal(),
    );
    assert.equal(file.format, 'png');
    assert.deepEqual(file.bytes, bytes);
  }
  const other =
    '--example\r\nContent-Disposition: form-data; name="config"\r\n\r\n{}\r\n--example--';
  await assert.rejects(
    readAttachmentMultipart(
      Readable.from([Buffer.from(other)]),
      'multipart/form-data; boundary=example',
      signal(),
    ),
    subCode('attachment_request_invalid'),
  );
});

test('attachment limit accepts exactly 10 MiB and stops chunked uploads at excess bytes', async (t) => {
  const f = await fixture(t);
  const exact = Buffer.alloc(MAX_FILE_BYTES, 'a');
  exact.write('%PDF-1.7\n');
  assert.equal(
    (await upload(f.origin, 'large.pdf', 'application/pdf', exact)).status,
    200,
  );
  let produced = 0;
  async function* chunks() {
    yield Buffer.from(
      '--example\r\nContent-Disposition: form-data; name="file"; filename="large.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n',
    );
    for (let i = 0; i < 500; i++) {
      produced++;
      yield Buffer.alloc(65_536, 'a');
      await delay(1);
    }
    yield Buffer.from('\r\n--example--');
  }
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=example' },
    body: Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>,
    duplex: 'half',
  };
  const response = await fetch(`${f.origin}/api/uploads/attachment`, init);
  assert.equal(response.status, 413, await response.clone().text());
  assert.ok(produced < 500);
  assert.ok(produced >= MAX_FILE_BYTES / 65_536);
  assert.equal(
    (await readdir(`${f.dataDir}/attachments`)).filter((name) =>
      name.endsWith('.json'),
    ).length,
    1,
  );
});

test('signed reads reject signature/key/origin/expiry tampering and expired URLs without model or network work', async (t) => {
  const f = await fixture(t, 'memory', [], {
    AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001',
  });
  const a = await attachment(f);
  const store = new AttachmentStore(f.settings);
  for (const mutate of [
    (url: URL) => url.searchParams.set('signature', 'a'.repeat(43)),
    (url: URL) =>
      url.searchParams.set(
        'expires',
        String(Math.floor(Date.now() / 1000) + 5000),
      ),
    (url: URL) => {
      url.pathname = url.pathname.replace(a.key, 'a'.repeat(64));
    },
    (url: URL) => url.searchParams.append('expires', '1'),
  ]) {
    const url = new URL(a.sourceUrl);
    mutate(url);
    const response = await fetch(url);
    assert.equal(response.status, 403);
    assert.equal(
      (await response.json()).subCode,
      'attachment_signature_invalid',
    );
  }
  const foreign = new URL(a.sourceUrl);
  foreign.hostname = 'example.com';
  assert.throws(
    () => store.localKey(foreign.href),
    subCode('attachment_signature_invalid'),
  );
  const expired = await store.readUrl(a.key, f.origin, Date.now() - 901_000);
  const response = await fetch(expired.url);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).subCode, 'attachment_url_expired');
  await f.restart();
  assert.equal(store.localKey(a.sourceUrl), a.key);
  const fresh = (
    await (
      await f.post('/api/uploads/attachment/read-url', { key: a.key })
    ).json()
  ).data;
  assert.equal((await fetch(fresh.url)).status, 200);
});

test('valid local URLs load from disk with no resolver/fetch; external private sources remain blocked', async (t) => {
  const f = await fixture(t, 'memory', [], {
    AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001',
  });
  const a = await attachment(f);
  const store = new AttachmentStore(f.settings);
  let lookups = 0;
  const offline = await store.readUrl(a.key, 'http://offline.example.com:1');
  const refs = await prepareAttachments(
    [{ ...a, sourceUrl: offline.url }],
    store,
    f.settings,
    signal(),
    async () => {
      lookups++;
      throw new Error('No network expected');
    },
  );
  assert.equal(refs[0].key, a.key);
  assert.equal(lookups, 0);
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('No network expected');
  };
  try {
    const context = await createAttachmentContext(store, refs, refs, signal());
    assert.match(
      JSON.stringify(
        await context.read({ key: a.key, page: 1, offset: 0, limit: 8000 }),
      ),
      /Example Lantern Lab/,
    );
  } finally {
    globalThis.fetch = original;
  }
  for (const sourceUrl of [
    'http://127.0.0.1/file.pdf',
    'http://2130706433/file.pdf',
    'http://[::1]/file.pdf',
    'http://169.254.169.254/file.pdf',
  ]) {
    const response = await f.post(
      '/api/chat',
      f.body({ attachments: [{ ...a, sourceUrl }] }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).subCode, 'source_host_blocked');
  }
  assert.equal(f.fake.requests.length, 0);
});

test('read_attachment paginates actual PDF pages and stores only a reference result', async (t) => {
  const f = await fixture(t, 'memory', [], {
    AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001',
  });
  const a = await attachment(f, 'attachment-pages.pdf');
  const refs = [{ key: a.key, name: a.name }];
  const context = await createAttachmentContext(
    new AttachmentStore(f.settings),
    refs,
    refs,
    signal(),
  );
  const first = await context.read({
    key: a.key,
    page: 1,
    offset: 0,
    limit: 30,
  });
  assert.ok('text' in first);
  assert.equal(first.text?.length, 30);
  assert.equal(first.nextOffset, 30);
  assert.equal(first.pageCount, 2);
  assert.match(context.prompt, /"pageCount":2/);
  const remainder = await context.read({
    key: a.key,
    page: 1,
    offset: 30,
    limit: 8000,
  });
  assert.ok('text' in remainder);
  assert.equal(remainder.nextOffset, null);
  assert.equal(remainder.nextPage, 2);
  const second = await context.read({
    key: a.key,
    page: 2,
    offset: 0,
    limit: 8000,
  });
  assert.ok('text' in second);
  assert.match(second.text, /Second page evidence/);
  await assert.rejects(
    context.read({ key: a.key, page: 3, offset: 0, limit: 10 }),
    subCode('attachment_page_invalid'),
  );
  await assert.rejects(
    context.read({ key: a.key, page: 1, offset: 200_000, limit: 10 }),
    subCode('attachment_offset_invalid'),
  );
  const result = await captureCustom(() =>
    context.tool.invoke({ key: a.key, page: 1, limit: 100 }),
  );
  assert.match(String(result.result), /attachmentRead/);
  assert.doesNotMatch(String(result.result), /First page evidence/);
  await assert.rejects(context.tool.invoke({ key: a.key, limit: 8001 }));
  const evidence = await context.evidence();
  assert.match(evidence.text, /First page evidence[\s\S]*Second page evidence/);
  assert.equal(evidence.unreadable, false);
  const image = await attachment(f, 'resume.png', 'image/png');
  const withImage = [...refs, { key: image.key, name: image.name }];
  const mixed = await createAttachmentContext(
    new AttachmentStore(f.settings),
    withImage,
    withImage,
    signal(),
  );
  assert.equal((await mixed.evidence()).unreadable, true);
});

for (const storage of ['memory', 'sqlite'] as const) {
  test(`PDF attachment conversation really reads the tool, answers, and rereads after restart (${storage})`, async (t) => {
    const f = await fixture(t, storage);
    const a = await attachment(f);
    f.fake.scripts.push(
      {
        calls: [
          {
            name: 'read_attachment',
            args: { key: a.key, page: 1, limit: 8000 },
          },
        ],
      },
      { text: 'The supplied file describes accessible forms.' },
    );
    const events = await f.chat(
      f.body({
        sessionId: 'attachment-conversation',
        agentMode: 'plan',
        attachments: [a],
      }),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === 'tool_started' &&
          event.payload.toolName === 'read_attachment',
      ),
    );
    assert.match(
      JSON.stringify(f.fake.requests[0].messages),
      /"?application\/pdf/,
    );
    assert.doesNotMatch(
      JSON.stringify(f.fake.requests[0].messages),
      /Example Lantern Lab/,
    );
    assert.match(
      JSON.stringify(f.fake.requests[1].messages),
      /Example Lantern Lab/,
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === 'message_chunk' &&
          event.content.includes('accessible forms'),
      ),
    );
    if (storage === 'sqlite') {
      const persistence = new Persistence(f.dataDir);
      try {
        for await (const checkpoint of persistence.saver.list({
          configurable: { thread_id: 'attachment-conversation' },
        }))
          assert.doesNotMatch(
            JSON.stringify(checkpoint),
            /Example Lantern Lab|signature=|data:image\/|example-test-key/,
          );
      } finally {
        persistence.close();
      }
    }
    await f.restart();
    f.fake.scripts.push(
      { calls: [{ name: 'read_attachment', args: { key: a.key, page: 1 } }] },
      { text: 'The same source is available.' },
    );
    await f.chat(
      f.body({
        sessionId: 'attachment-conversation',
        agentMode: 'plan',
        messages: [{ role: 'user', content: 'Read that attachment again.' }],
      }),
    );
    assert.match(
      JSON.stringify(f.fake.requests.at(-1)?.messages),
      /Example Lantern Lab/,
    );
    await fetch(`${f.origin}/api/chat/session`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'attachment-conversation' }),
    });
    assert.equal(
      (await f.post('/api/uploads/attachment/read-url', { key: a.key })).status,
      200,
    );
  });
}

for (const [name, mime] of [
  ['resume.png', 'image/png'],
  ['resume.jpeg', 'image/jpeg'],
  ['resume.webp', 'image/webp'],
  ['scanned.pdf', 'application/pdf'],
]) {
  test(`${name} reaches the chat model as real image parts; Ask has no resume`, async (t) => {
    const f = await fixture(t, 'sqlite', [
      { text: 'The attached page is readable.' },
    ]);
    const a = await attachment(f, name, mime);
    await f.chat(
      f.body({ sessionId: 'image-chat', agentMode: 'ask', attachments: [a] }),
    );
    const sent = f.fake.requests[0];
    const images = sent.messages.flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.filter((part) => part.type === 'image_url')
        : [],
    );
    assert.equal(images.length, 1);
    assert.ok((images[0].image_url as { url: string }).url.length > 1000);
    assert.doesNotMatch(JSON.stringify(sent), /alex@example.com|example-role/);
    assert.ok(
      sent.tools?.some((tool) => tool.function.name === 'read_attachment'),
    );
    assert.ok(
      !sent.tools?.some((tool) => tool.function.name === 'read_resume'),
    );
    const persistence = new Persistence(f.dataDir);
    try {
      for await (const checkpoint of persistence.saver.list({
        configurable: { thread_id: 'image-chat' },
      }))
        assert.doesNotMatch(
          JSON.stringify(checkpoint),
          /data:image\/|signature=/,
        );
    } finally {
      persistence.close();
    }
  });
}

test('image rejection has an explicit error code and never discards the attachment', async (t) => {
  const f = await fixture(t, 'memory', [
    {
      status: 400,
      code: 'unsupported_image',
      message: 'This model does not support image input.',
    },
  ]);
  const a = await attachment(f, 'resume.png', 'image/png');
  const response = await f.post('/api/chat', f.body({ attachments: [a] }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).subCode, 'model_vision_unsupported');
  assert.equal(f.fake.requests.length, 1);
});

test('three attachments are accepted, a fourth is rejected before model work, and expired read URLs fail during chat', async (t) => {
  const f = await fixture(
    t,
    'memory',
    [{ text: 'Read the supplied images.' }],
    { AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001' },
  );
  const a = await attachment(f, 'resume.png', 'image/png');
  const four = await f.post('/api/chat', f.body({ attachments: [a, a, a, a] }));
  assert.equal(four.status, 400);
  assert.equal(f.fake.requests.length, 0);
  const expired = await new AttachmentStore(f.settings).readUrl(
    a.key,
    f.origin,
    Date.now() - 901_000,
  );
  const response = await f.post(
    '/api/chat',
    f.body({ attachments: [{ ...a, sourceUrl: expired.url }] }),
  );
  assert.equal(response.status, 410);
  assert.equal((await response.json()).subCode, 'attachment_url_expired');
  await f.chat(f.body({ attachments: [a, a, a] }));
  // Identical keys are one source; the per-turn cap still counts the submitted entries.
  assert.equal(f.fake.requests.length, 1);
});

test('attachment references survive a SQLite approval pause and service restart without resending URLs', async (t) => {
  const f = await fixture(t, 'sqlite', [
    {
      calls: [
        {
          name: 'ask_choice',
          args: {
            message: 'Which detail should be checked?',
            options: ['Responsibilities', 'Education'],
          },
        },
      ],
    },
  ]);
  const a = await attachment(f);
  const paused = await f.chat(
    f.body({ sessionId: 'attachment-approval', attachments: [a] }),
  );
  assert.ok(paused.some((event) => event.type === 'tool_approval_request'));
  const state = await f.state('attachment-approval');
  await f.restart();
  f.fake.scripts.push(
    { calls: [{ name: 'read_attachment', args: { key: a.key } }] },
    { text: 'The attached responsibilities describe accessible forms.' },
  );
  const response = await f.post('/api/chat/approve', {
    ...f.body(),
    ...state.pendingApproval,
    sessionId: 'attachment-approval',
    decisions: [{ type: 'reject', message: 'Read the existing evidence.' }],
  });
  assert.equal(response.status, 200, await response.clone().text());
  const events = frames(await response.text());
  assert.ok(
    events.some(
      (event) =>
        event.type === 'message_chunk' &&
        event.content.includes('accessible forms'),
    ),
  );
  assert.match(
    JSON.stringify(f.fake.requests.at(-1)?.messages),
    /Example Lantern Lab/,
  );
  assert.doesNotMatch(JSON.stringify(f.fake.requests), /signature=/);
});

test('expired/deleted attachments fail explicitly and TTL collection removes only expired files', async (t) => {
  const f = await fixture(t, 'memory', [], {
    AGENT_ATTACHMENT_SECRET: 'example-attachment-signing-secret-0001',
    AGENT_ATTACHMENT_TTL_HOURS: '0.001',
  });
  const a = await attachment(f, 'resume.png', 'image/png');
  const store = new AttachmentStore(f.settings);
  await assert.rejects(
    store.metadata(a.key, Date.now() + 4000),
    subCode('attachment_expired'),
  );
  assert.equal(await store.collectExpired(Date.now() + 4000), 1);
  assert.deepEqual(await readdir(store.directory), []);
  const missing = await f.post('/api/uploads/attachment/read-url', {
    key: a.key,
  });
  assert.equal((await missing.json()).subCode, 'attachment_not_found');
  const b = await attachment(f, 'resume.png', 'image/png');
  await rm(`${store.directory}/${b.key}.bin`);
  await assert.rejects(
    store.read(b.key, signal()),
    subCode('attachment_not_found'),
  );
  const context = await createAttachmentContext(
    store,
    [{ name: a.name, key: a.key }],
    [],
    signal(),
  );
  assert.match(context.prompt, /attachment_not_found/);
  assert.match(
    String(await context.tool.invoke({ key: a.key })),
    /upload it again/,
  );
  assert.deepEqual(
    await context.hydrate([new HumanMessage('No image remains.')]),
    [new HumanMessage('No image remains.')],
  );
});
