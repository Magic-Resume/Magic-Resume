import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectUpstreamError } from './errorProjection';
import { projectUpstreamError as compatibilityProjection } from '@/app/api/chat-agent/errorProjection';

test('error projection retains all machine fields including false, zero and empty params', () => {
  const projected = projectUpstreamError(422, JSON.stringify({
    errorCode: 'invalid_input', subCode: 'example_invalid', params: { count: 0 }, requestId: 'example-request', retryable: false,
    message: 'Example provider diagnostic', stack: 'Example stack', error: 'Example exception', config: { apiKey: 'example-test-key' },
  }));
  assert.deepEqual(projected, {
    errorCode: 'invalid_input', subCode: 'example_invalid', params: { count: 0 }, requestId: 'example-request', retryable: false, error: 'invalid_input',
  });
  assert.deepEqual(projectUpstreamError(400, '{"params":{},"retryable":false}'), { params: {}, retryable: false, error: 'upstream_400' });
  assert.equal(compatibilityProjection, projectUpstreamError);
});

test('error projection turns malformed, primitive and unrecognized errors into a status code', () => {
  for (const body of ['', '<html>Example error</html>', 'null', '42', 'true', '"Example error"', '[]', '{"message":"Example diagnostic"}']) {
    assert.deepEqual(projectUpstreamError(502, body), { error: 'upstream_502' });
  }
});
