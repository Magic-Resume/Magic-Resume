import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { fixture, waitFor } from './helpers.js';

const output = {
  after: '<p>Implemented accessible input validation.</p>',
  rationale: 'Clarifies the supported contribution.',
  rationaleDetail: 'Keeps the original ownership and scope.',
};
test('both edit routes use one stateless call with no resume context, tools or checkpoint', async (t) => {
  const f = await fixture(t, 'sqlite', [
    { text: JSON.stringify(output) },
    { text: '```json\n' + JSON.stringify(output) + '\n```' },
  ]);
  for (const path of ['/api/agent/edit', '/api/chat/edit']) {
    const response = await f.post(path, {
      action: 'polish',
      before: '<p>Built input checks.</p>',
      locale: 'en',
      config: f.body().config,
      sessionId: 'must-not-exist',
      currentResume: { secret: 'example-resume-marker' },
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), output);
  }
  assert.equal(f.fake.requests.length, 2);
  for (const request of f.fake.requests) {
    assert.equal(request.tools, undefined);
    assert.equal(request.messages.length, 2);
    assert.doesNotMatch(
      JSON.stringify(request.messages),
      /example-resume-marker|must-not-exist|example-test-key/,
    );
    assert.match(JSON.stringify(request.messages), /locale en/);
  }
  const db = new Database(join(f.dataDir, 'checkpoints.sqlite'), {
    readonly: true,
  });
  try {
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS count FROM turns').get(), {
      count: 0,
    });
  } finally {
    db.close();
  }
  assert.equal((await f.state('must-not-exist')).state, 'not_found');
});

test('edit validation rejects unknown actions, absent source, invalid selection and missing translation target', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { action: 'unknown', before: 'Known text' },
    { action: 'polish', before: '' },
    { action: 'translate', before: 'Known text' },
    { action: 'free', before: 'Known text', selectionText: 'absent text' },
    { action: 'insert', before: '' },
  ]) {
    const response = await f.post('/api/agent/edit', {
      ...patch,
      config: f.body().config,
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).errorCode, 'invalid_input');
  }
  assert.equal(f.fake.requests.length, 0);
});

test('selection edits preserve surrounding field context and inserts accept empty before with evidence', async (t) => {
  const after =
    '<p>Earlier sentence. Implemented input validation. Later sentence.</p>';
  const f = await fixture(t, 'memory', [
    { text: JSON.stringify({ after, rationale: 'Clarified action.' }) },
    {
      text: JSON.stringify({
        after: '<p>Documented the component API.</p>',
        rationale: 'Uses supplied source notes.',
      }),
    },
  ]);
  const response = await f.post('/api/agent/edit', {
    action: 'verb',
    before: '<p>Earlier sentence. Built input checks. Later sentence.</p>',
    selectionText: 'Built input checks.',
    locale: 'en',
    config: f.body().config,
  });
  assert.equal((await response.json()).after, after);
  assert.match(
    JSON.stringify(f.fake.requests[0].messages),
    /only that exact selection changed/,
  );
  const inserted = await f.post('/api/agent/edit', {
    action: 'insert',
    before: '',
    instruction: 'I documented the component API.',
    config: f.body().config,
  });
  assert.equal(inserted.status, 200);
  assert.equal(f.fake.requests.length, 2);
});

test('empty and invalid edit output fail without another model call or raw provider text', async (t) => {
  const f = await fixture(t, 'memory', [
    { text: '{"after":"  ","rationale":"example-test-key"}' },
    { text: 'not JSON example-test-key' },
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await f.post('/api/agent/edit', {
      action: 'quantify',
      before: 'Documented the API.',
      config: f.body().config,
    });
    assert.equal(response.status, 502);
    const failure = await response.text();
    assert.match(failure, /model_edit_output_invalid/);
    assert.doesNotMatch(failure, /example-test-key/);
  }
  assert.equal(f.fake.requests.length, 2);
});

for (const [status, code] of [
  [401, 'unauthenticated'],
  [403, 'forbidden'],
  [429, 'rate_limited'],
  [503, 'upstream_unavailable'],
] as const) {
  test(`edit maps provider ${status} to the same chat error vocabulary`, async (t) => {
    const f = await fixture(t, 'memory', [{ status }]);
    const response = await f.post('/api/agent/edit', {
      action: 'shorten',
      before: 'Documented the API.',
      config: f.body().config,
    });
    const failure = await response.json();
    assert.equal(failure.errorCode, code);
    assert.doesNotMatch(
      JSON.stringify(failure),
      /example-test-key|Provider detail/,
    );
    assert.equal(f.fake.requests.length, 1);
  });
}

test('aborting a snippet request cancels the model call', async (t) => {
  const f = await fixture(t, 'memory', [{ hang: true }]);
  const controller = new AbortController();
  const pending = f.post(
    '/api/agent/edit',
    { action: 'polish', before: 'Known source.', config: f.body().config },
    controller.signal,
  );
  await waitFor(() => f.fake.requests.length === 1);
  controller.abort();
  await assert.rejects(pending);
  await waitFor(() => f.fake.state.aborted === 1);
});
