import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModelResilience,
  NAME,
  retryable,
  withModelRetry,
} from '../src/harness/middleware/model-resilience.js';
test('ModelResilience retries only transient failures before output and honors cancellation', async () => {
  assert.equal(createModelResilience(() => 0).name, NAME);
  for (const status of [401, 402, 403, 404, 400])
    assert.equal(retryable({ status }), false);
  for (const status of [429, 500, 503])
    assert.equal(retryable({ status }), true);
  assert.equal(
    retryable({ status: 429, error: { code: 'insufficient_quota' } }),
    false,
  );
  let attempts = 0;
  const result = await withModelRetry(
    async () => {
      if (attempts++ === 0) throw { status: 503 };
      return 'success';
    },
    { emitted: () => 0, delayMs: 1 },
  );
  assert.equal(result, 'success');
  assert.equal(attempts, 2);
  let emitted = 0;
  attempts = 0;
  await assert.rejects(
    withModelRetry(
      async () => {
        attempts++;
        emitted++;
        throw new Error('Connection interrupted');
      },
      { emitted: () => emitted, delayMs: 1 },
    ),
  );
  assert.equal(attempts, 1);
  const controller = new AbortController();
  controller.abort();
  assert.equal(retryable(new Error(), controller.signal), false);
});

test('arbitrary execution errors are not network retries and deep middleware wrapping retains provider status', () => {
  assert.equal(retryable(new Error('Invalid state')), false);
  let failure: unknown = { status: 503 };
  for (let i = 0; i < 25; i++)
    failure = new Error('Middleware failed', { cause: failure });
  assert.equal(retryable(failure), true);
});
