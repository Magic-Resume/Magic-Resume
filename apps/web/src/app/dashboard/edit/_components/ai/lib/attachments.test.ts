import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCEPT_ATTR, kindOf, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, validateIncoming, type StagedAttachment } from './attachments';

const file = (name = 'example.pdf', content = 'Example file', type = 'application/pdf') => new File([content], name, { type });
const staged = (value: File, status: StagedAttachment['status'] = 'ready'): StagedAttachment => ({ id: value.name, file: value, kind: 'pdf', status });

test('attachments accept visual formats by MIME with an extension fallback only for missing MIME', () => {
  for (const [name, mime, expected] of [
    ['example.pdf', 'application/pdf', 'pdf'], ['example.png', 'image/png', 'image'],
    ['example.jpg', 'image/jpeg', 'image'], ['example.webp', 'image/webp', 'image'],
    ['EXAMPLE.PDF', '', 'pdf'], ['EXAMPLE.JPEG', '', 'image'],
    ['example.pdf', 'application/zip', null], ['example.svg', 'image/svg+xml', null],
    ['example.docx', '', null], ['example.md', 'text/markdown', null], ['example.txt', 'text/plain', null],
  ] as const) {
    assert.equal(kindOf(file(name, 'Example', mime)), expected, `${name} (${mime})`);
  }
  for (const extension of ['.pdf', '.png', '.jpg', '.jpeg', '.webp']) assert.ok(ACCEPT_ATTR.split(',').includes(extension));
});

test('attachments accept exactly the size limit and reject the next byte', () => {
  assert.equal(MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024);
  const exact = new File([new Uint8Array(MAX_ATTACHMENT_BYTES)], 'example.pdf', { type: 'application/pdf' });
  const tooLarge = new File([exact, 'x'], 'example.pdf', { type: 'application/pdf' });
  assert.deepEqual(validateIncoming(exact, []), { ok: true, kind: 'pdf' });
  assert.deepEqual(validateIncoming(tooLarge, []), { ok: false, reason: 'too-large' });
});

test('all staged statuses count toward the three-file limit without mutating the queue', () => {
  assert.equal(MAX_ATTACHMENTS, 3);
  const existing = [staged(file('first.pdf'), 'uploading'), staged(file('second.pdf'), 'failed'), staged(file('third.pdf'))];
  const before = existing.slice();
  assert.deepEqual(validateIncoming(file(), existing.slice(0, 2)), { ok: true, kind: 'pdf' });
  assert.deepEqual(validateIncoming(file(), existing), { ok: false, reason: 'too-many' });
  assert.deepEqual(existing, before);
});

test('duplicate detection uses both name and size and does not reject a distinct file', () => {
  const existing = [staged(file())];
  assert.deepEqual(validateIncoming(file(), existing), { ok: false, reason: 'duplicate' });
  assert.deepEqual(validateIncoming(file('other.pdf'), existing), { ok: true, kind: 'pdf' });
  assert.deepEqual(validateIncoming(file('example.pdf', 'Different length'), existing), { ok: true, kind: 'pdf' });
});
