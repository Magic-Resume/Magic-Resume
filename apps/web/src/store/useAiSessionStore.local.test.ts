import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiSessionStore, getAiSessionStorageKey } from './useAiSessionStore';

test('committed messages survive immediate reload without waiting for the UI debounce', async () => {
  const rows = new Map<string, unknown>();
  const db = {
    async getItem<T>(key: string) { return (rows.get(key) as T) ?? null; },
    async setItem<T>(key: string, value: T) { rows.set(key, structuredClone(value)); },
    async removeItem(key: string) { rows.delete(key); },
  };
  const first = createAiSessionStore({ db, idFactory: () => 'local-session', now: () => 1 });
  first.getState().patchSession('resume', {
    started: true,
    agentMode: 'ask',
    messages: [{ id: 'user', role: 'user', content: 'A local message' }],
  });
  const reopened = createAiSessionStore({ db, now: () => 30 * 24 * 60 * 60 * 1000 });
  const session = await reopened.getState().loadSession('resume');
  assert.equal(session.sessionId, 'local-session');
  assert.equal(session.agentMode, 'ask');
  assert.equal(session.started, true);
  assert.equal(session.messages[0]?.content, 'A local message');
  // A month-old conversation stays local and is not expired.
  assert.equal(rows.size, 1);
  reopened.getState().resetSession('resume');
  const reset = await createAiSessionStore({ db }).getState().loadSession('resume');
  assert.equal(reset.messages.length, 0);
  assert.equal(rows.size, 1);
  assert.ok(rows.has(getAiSessionStorageKey('resume')));
});
