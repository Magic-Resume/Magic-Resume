import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { resumeSchema } from '@magic-resume-kit/resume-schema';
import { fixture, frames, resume, waitFor } from './helpers.js';
import { MAX_FILE_BYTES } from '../src/document/input.js';

const files = [
  ['resume.pdf', 'application/pdf', false],
  ['scanned.pdf', 'application/pdf', true],
  [
    'resume.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    false,
  ],
  ['resume.png', 'image/png', true],
  ['resume.jpeg', 'image/jpeg', true],
  ['resume.webp', 'image/webp', true],
  ['resume.md', 'text/markdown', false],
  ['resume.txt', 'text/plain', false],
] as const;
export const importedResume = {
  ...resume,
  sections: {
    ...resume.sections,
    experience: [
      {
        id: 'example-role',
        visible: true,
        company: 'Example Lantern Lab',
        position: 'Engineer',
        date: '2022 - 2024',
        summary:
          '<p>Implemented accessible forms and input validation.</p><p>Documented component behavior and tested keyboard navigation.</p>',
      },
    ],
  },
};
const configFor = (f: Awaited<ReturnType<typeof fixture>>) => f.body().config;
async function formFor(
  f: Awaited<ReturnType<typeof fixture>>,
  filename = 'resume.txt',
  mime = 'text/plain',
) {
  const form = new FormData();
  form.set(
    'file',
    new Blob(
      [await readFile(new URL(`./fixtures/${filename}`, import.meta.url))],
      { type: mime },
    ),
    filename,
  );
  form.set('config', JSON.stringify(configFor(f)));
  return form;
}
for (const [filename, mime, vision] of files) {
  test(`import ${filename} uses real extraction and sends ${vision ? 'image input' : 'document text'} to one tool-free model turn`, async (t) => {
    const f = await fixture(t, 'memory', [
      { text: JSON.stringify(importedResume) },
    ]);
    const response = await fetch(`${f.origin}/api/pdf/parse`, {
      method: 'POST',
      body: await formFor(f, filename, mime),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const events = frames(await response.text());
    const progress = events.filter(
      (event) => event.type === 'tool_result' && 'kind' in event.payload,
    );
    assert.ok(progress.length >= 3);
    assert.ok(
      progress[0].type === 'tool_result' && 'kind' in progress[0].payload,
    );
    assert.equal(progress[0].payload.kind, 'pdf_progress');
    assert.equal(progress[0].payload.phase, 'extracting');
    const update = events.find((event) => event.type === 'resume_update');
    assert.ok(update?.type === 'resume_update');
    assert.equal(resumeSchema.safeParse(update.payload.resume).success, true);
    assert.equal(
      update.payload.resume.info &&
        (update.payload.resume.info as { fullName: string }).fullName,
      'Alex Chen',
    );
    assert.equal(
      events.some((event) => event.type === 'error'),
      false,
    );
    assert.equal(f.fake.requests.length, 1);
    const request = f.fake.requests[0];
    assert.equal(request.tools, undefined);
    assert.equal(request.messages.length, 2);
    assert.doesNotMatch(JSON.stringify(request), /example-test-key/);
    assert.deepEqual(f.fake.authorization, ['Bearer example-test-key']);
    const content = request.messages.find(
      (message) => message.role === 'user',
    )!.content;
    if (vision) {
      assert.ok(Array.isArray(content));
      const images = content.filter((block) => block.type === 'image_url');
      assert.equal(images.length, 1);
      const url = (images[0].image_url as { url: string }).url;
      assert.match(url, /^data:image\/(png|jpeg|webp);base64,/);
      const binary = Buffer.from(url.split(',')[1], 'base64');
      assert.ok(
        binary.length > 1000,
        'the model receives the real document image',
      );
      assert.ok(
        progress.some(
          (event) =>
            event.type === 'tool_result' &&
            'kind' in event.payload &&
            event.payload.mode === 'vision' &&
            event.payload.pageCount === 1,
        ),
      );
    } else {
      assert.equal(typeof content, 'string');
      assert.match(content as string, /Example Lantern Lab/);
      assert.match(content as string, /Documented component behavior/);
      assert.equal(
        progress.some(
          (event) => event.type === 'tool_result' && 'mode' in event.payload,
        ),
        false,
      );
    }
    const state = await f.state('unused-import');
    assert.equal(state.state, 'not_found');
  });
}

test('import repairs invalid JSON with field-level errors at most twice', async (t) => {
  const f = await fixture(t, 'memory', [
    {
      text: JSON.stringify({
        ...importedResume,
        info: { ...resume.info, fullName: 123 },
      }),
    },
    { text: 'not JSON' },
    { text: JSON.stringify(importedResume) },
  ]);
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f),
  });
  const events = frames(await response.text());
  assert.ok(events.some((event) => event.type === 'resume_update'));
  assert.equal(f.fake.requests.length, 3);
  assert.match(JSON.stringify(f.fake.requests[1].messages), /info.fullName/);
  assert.match(JSON.stringify(f.fake.requests[2].messages.at(-1)), /\(root\)/);
  f.fake.scripts.push(
    { text: '{}' },
    { text: '{}' },
    { text: '{}' },
    { text: JSON.stringify(importedResume) },
  );
  const failed = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f),
  });
  const failure = frames(await failed.text());
  assert.equal(f.fake.requests.length, 6);
  assert.equal(
    failure.some((event) => event.type === 'resume_update'),
    false,
  );
  assert.ok(
    failure.some(
      (event) =>
        event.type === 'error' &&
        event.payload.subCode === 'resume_parse_invalid',
    ),
  );
});

test('vision rejection and empty extraction never become an empty resume', async (t) => {
  const f = await fixture(t, 'memory', [
    {
      status: 400,
      code: 'unsupported_image',
      message: 'This model does not support image inputs. example-test-key',
    },
  ]);
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f, 'scanned.pdf', 'application/pdf'),
  });
  const events = frames(await response.text());
  assert.ok(
    events.some(
      (event) =>
        event.type === 'error' &&
        event.payload.errorCode === 'misconfigured' &&
        event.payload.subCode === 'model_vision_unsupported',
    ),
  );
  assert.equal(
    events.some((event) => event.type === 'resume_update'),
    false,
  );
  assert.doesNotMatch(JSON.stringify(events), /example-test-key|This model/);
  f.fake.scripts.push(
    ...Array.from({ length: 3 }, () => ({
      text: JSON.stringify({
        ...resume,
        info: { ...resume.info, fullName: '', headline: '', email: '' },
        sections: {},
      }),
    })),
  );
  const blank = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f),
  });
  const blankEvents = frames(await blank.text());
  assert.equal(
    blankEvents.some((event) => event.type === 'resume_update'),
    false,
  );
  assert.ok(blankEvents.some((event) => event.type === 'error'));
});

test('unsupported MIME, malformed content and missing configuration are rejected', async (t) => {
  const f = await fixture(t);
  const unsupported = await formFor(f, 'resume.txt', 'text/html');
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: unsupported,
  });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).subCode, 'document_type_unsupported');
  const malformed = await formFor(f);
  malformed.set(
    'file',
    new Blob(['not a pdf'], { type: 'application/pdf' }),
    'resume.pdf',
  );
  const invalid = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: malformed,
  });
  assert.ok(
    frames(await invalid.text()).some(
      (event) =>
        event.type === 'error' &&
        event.payload.subCode === 'document_content_invalid',
    ),
  );
  const missing = await formFor(f);
  missing.delete('config');
  assert.equal(
    (
      await fetch(`${f.origin}/api/pdf/parse`, {
        method: 'POST',
        body: missing,
      })
    ).status,
    400,
  );
  assert.equal(f.fake.requests.length, 0);
});

test('chunked multipart stops at the file limit before reading the rest of the upload', async (t) => {
  const f = await fixture(t);
  let produced = 0;
  const boundary = 'example-bounded-upload';
  const totalChunks = 500;
  async function* upload() {
    yield Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="config"\r\n\r\n${JSON.stringify(configFor(f))}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="resume.txt"\r\nContent-Type: text/plain\r\n\r\n`,
    );
    for (let index = 0; index < totalChunks; index++) {
      produced++;
      yield Buffer.alloc(65_536, 'x');
      await delay(1);
    }
    yield Buffer.from(`\r\n--${boundary}--\r\n`);
  }
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Readable.toWeb(Readable.from(upload())) as ReadableStream<Uint8Array>,
    duplex: 'half',
  };
  const response = await fetch(`${f.origin}/api/pdf/parse`, options);
  assert.equal(response.status, 413, await response.clone().text());
  assert.equal((await response.json()).subCode, 'document_too_large');
  assert.ok(
    produced < totalChunks,
    `read only ${produced} of ${totalChunks} chunks`,
  );
  assert.ok(produced * 65_536 >= MAX_FILE_BYTES);
  assert.equal(f.fake.requests.length, 0);
});

test('JSON and multipart sourceUrl cannot download private addresses even with local models enabled', async (t) => {
  const f = await fixture(t);
  for (const sourceUrl of [
    'http://127.0.0.1/resume.pdf',
    'http://2130706433/resume.pdf',
    'http://[::1]/resume.pdf',
    'http://169.254.169.254/resume.pdf',
  ]) {
    const response = await f.post('/api/pdf/parse', {
      sourceUrl,
      config: JSON.stringify(configFor(f)),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).subCode, 'source_host_blocked');
  }
  const form = new FormData();
  form.set('sourceUrl', 'http://localhost/resume.pdf');
  form.set('config', JSON.stringify(configFor(f)));
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: form,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).subCode, 'source_host_blocked');
  assert.equal(f.fake.requests.length, 0);
});

test('closing an import stream cancels the upstream model', async (t) => {
  const f = await fixture(t, 'memory', [{ text: '{"name":', hang: true }]);
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f),
  });
  const reader = response.body!.getReader();
  await reader.read();
  await waitFor(() => f.fake.requests.length === 1);
  await reader.cancel();
  await waitFor(() => f.fake.state.aborted === 1);
});

test('an import deadline still emits a fixed error and done before closing', async (t) => {
  const f = await fixture(t, 'memory', [{ hang: true }], {
    AGENT_RUN_TIMEOUT_MS: '300',
  });
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: await formFor(f),
  });
  const events = frames(await response.text());
  assert.ok(
    events.some(
      (event) =>
        event.type === 'error' && event.payload.subCode === 'model_timeout',
    ),
  );
  assert.equal(
    events.some((event) => event.type === 'resume_update'),
    false,
  );
  await waitFor(() => f.fake.state.aborted === 1);
});
