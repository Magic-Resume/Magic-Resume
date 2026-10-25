import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verificationWidget } from './verificationWidget';

test('findings create a stable per-run card and take priority over degraded status', () => {
  const items = ['Example Lantern Lab', 'Example Award'];
  assert.deepEqual(verificationWidget({ suspectedFabrications: items, status: 'degraded', reason: 'attachment_unverifiable' }, 'example-run', () => { throw new Error('findings need no translated override'); }), {
    widgetId: 'verification:example-run', envelope: { kind: 'fabrication_notice', props: { items } },
  });
  assert.equal(verificationWidget({ suspectedFabrications: items }, undefined, (key) => key)?.widgetId, 'verification:run');
});

test('an unverifiable attachment uses the attachment-specific translation keys', () => {
  assert.deepEqual(verificationWidget({ status: 'degraded', reason: 'attachment_unverifiable', suspectedFabrications: [] }, 'example-run', (key) => `translated:${key}`), {
    widgetId: 'verification:example-run',
    envelope: { kind: 'fabrication_notice', props: { title: 'translated:aiLab.widgets.verification.attachmentTitle', body: 'translated:aiLab.widgets.verification.attachmentBody' } },
  });
});

test('all other degraded reasons use the generic degraded translation keys', () => {
  for (const reason of [undefined, 'missing_baseline', 'example_future_reason']) {
    assert.deepEqual(verificationWidget({ status: 'degraded', reason }, 'example-run', (key) => key)?.envelope.props, {
      title: 'aiLab.widgets.verification.degradedTitle', body: 'aiLab.widgets.verification.degradedBody',
    });
  }
});

test('successful, empty and missing verification payloads create no notice', () => {
  for (const payload of [undefined, null, {}, { status: 'ok' }, { suspectedFabrications: [] }, { suspectedFabrications: 'Example invalid array' }]) {
    assert.equal(verificationWidget(payload, undefined, (key) => key), null);
  }
});
