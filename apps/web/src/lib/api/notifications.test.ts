import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { AxiosError, type AxiosAdapter } from 'axios';
import { httpClient } from './httpClient';
import { notificationsApi } from './notifications';

const flushRequests = () => new Promise<void>(resolve => setImmediate(resolve));
function stubResponses(t: TestContext, statuses: number[], retryable = true) {
  const original = httpClient.api.defaults.adapter;
  const calls: string[] = [];
  httpClient.api.defaults.adapter = (async config => {
    calls.push(config.url!);
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    const response = { config, status, statusText: String(status), headers: {}, data: status === 200
      ? { code: 200, data: { id: 'notification_1', isRead: true } }
      : { errorCode: 'service_unavailable', retryable } };
    if (status !== 200) throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, response);
    return response;
  }) satisfies AxiosAdapter;
  t.after(() => { httpClient.api.defaults.adapter = original; });
  t.mock.method(console, 'error', () => {});
  return calls;
}

test('opening an announcement recovers its read receipt after the backend restarts without requiring another click', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = stubResponses(t, [503, 503, 503, 503, 503, 200]);
  const receipt = notificationsApi.markAsRead('notification_1');
  // 同步接住旧实现的失败，让断言本身清楚报告缺少自动恢复。
  const result = receipt.then(value => ({ value }), error => ({ error }));
  for (const delay of [1000, 2000, 4000, 8000, 16000]) {
    await flushRequests();
    t.mock.timers.tick(delay);
  }
  await flushRequests();
  const settled = await result;
  assert.ok('value' in settled, 'read receipt should recover from temporary 503 responses');
  assert.equal(settled.value.isRead, true);
  assert.deepEqual(calls, Array(6).fill('/api/notifications/notification_1/read'));
});

test('read receipts stop after bounded retries when the service stays unavailable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = stubResponses(t, [503]);
  const rejected = assert.rejects(notificationsApi.markAsRead('notification_1'));
  for (const delay of [1000, 2000, 4000, 8000, 16000]) {
    await flushRequests();
    t.mock.timers.tick(delay);
  }
  await rejected;
  assert.equal(calls.length, 6);
});

for (const status of [401, 403, 404, 500]) {
  test(`read receipts do not retry permanent HTTP ${status} failures`, async t => {
    const calls = stubResponses(t, [status]);
    await assert.rejects(notificationsApi.markAsRead('notification_1'));
    assert.equal(calls.length, 1);
  });
}

test('read receipts respect an explicit non-retryable response', async t => {
  const calls = stubResponses(t, [503], false);
  await assert.rejects(notificationsApi.markAsRead('notification_1'));
  assert.equal(calls.length, 1);
});
