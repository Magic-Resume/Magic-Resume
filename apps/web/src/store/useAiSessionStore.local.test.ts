import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiSessionStore, getAiSessionStorageKey } from './useAiSessionStore';
import { MemoryDb } from '../../scripts/test-memory-db';
import { settleWidgetInMessages } from '@/app/dashboard/edit/_components/ai/lib/widgetPlacement';
import type { ChatMessage } from '@/app/dashboard/edit/_components/ai/types';

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

test('each resume has one independent session, including an explicitly empty conversation', async () => {
  const db = new MemoryDb();
  let nextId = 0;
  const store = createAiSessionStore({ db, idFactory: () => `example-session-${++nextId}` });
  const first = store.getState().ensureSession('resume-a');
  assert.equal(store.getState().ensureSession('resume-a'), first);
  store.getState().patchSession('resume-a', { started: true, sessionUsed: true, messages: [{ id: 'user', role: 'user', content: 'Example question' }] });
  const second = store.getState().ensureSession('resume-b');
  assert.notEqual(first.sessionId, second.sessionId);
  await store.getState().flushSession('resume-a');
  await store.getState().flushSession('resume-b');
  const reopened = createAiSessionStore({ db });
  assert.equal((await reopened.getState().loadSession('resume-a')).messages[0].content, 'Example question');
  assert.equal((await reopened.getState().loadSession('resume-a')).sessionUsed, true);
  assert.deepEqual((await reopened.getState().loadSession('resume-b')).messages, []);
  assert.equal(Object.keys(reopened.getState().sessions).length, 2);
  assert.deepEqual(await db.getAllKeys(), [getAiSessionStorageKey('resume-a'), getAiSessionStorageKey('resume-b')]);
});

test('old local sessions retain messages, analysis and their session id without expiry', async () => {
  const db = new MemoryDb();
  const store = createAiSessionStore({ db, now: () => 1, idFactory: () => 'example-session' });
  const analysis = {
    overall_score: 83,
    category_averages: { impact: 80 },
    peer_analysis: { persona: 'peer_developer' as const, score: 82, categories_scores: { impact: 80 }, strengths: ['Clear skills'], weaknesses: ['Missing evidence'], suggestions: ['Add evidence'] },
    leader_analysis: { persona: 'tech_lead' as const, score: 84, categories_scores: { impact: 84 }, strengths: ['Clear ownership'], weaknesses: ['Missing scope'], suggestions: ['Clarify scope'] },
    hrbp_analysis: { persona: 'hrbp' as const, score: 83, categories_scores: { impact: 82 }, strengths: ['Clear experience'], weaknesses: ['Missing keywords'], suggestions: ['Add keywords'] },
  };
  store.getState().patchSession('resume', { started: true, messages: [{ id: 'user', role: 'user', content: 'Example question' }], analysis });
  await store.getState().flushSession('resume');
  const reopened = createAiSessionStore({ db, now: () => 366 * 24 * 60 * 60 * 1000 });
  const session = await reopened.getState().loadSession('resume');
  assert.equal(session.sessionId, 'example-session');
  assert.equal(session.started, true);
  assert.equal(session.messages[0].content, 'Example question');
  assert.deepEqual(session.analysis, analysis);
  assert.equal(db.items.size, 1);
});

test('missing storage creates a fresh local session and reset clears all conversation state durably', async () => {
  const db = new MemoryDb();
  let id = 0;
  const store = createAiSessionStore({ db, idFactory: () => `example-${++id}` });
  const empty = await store.getState().loadSession('resume');
  assert.equal(empty.sessionId, 'example-1');
  assert.equal(empty.started, false);
  assert.deepEqual(empty.messages, []);
  store.getState().patchSession('resume', { started: true, sessionUsed: true, agentMode: 'ask', chatMode: 'create', livingOpen: true, livingSkillId: 'analyze', canvas: { open: true, skillId: 'analyze', view: 'score', status: 'ready' }, messages: [{ id: 'user', role: 'user', content: 'Example question' }] });
  const reset = store.getState().resetSession('resume');
  await store.getState().flushSession('resume');
  assert.equal(reset.sessionId, 'example-2');
  assert.equal(reset.sessionUsed, false);
  assert.equal(reset.started, false);
  assert.equal(reset.chatMode, 'idle');
  assert.equal(reset.livingOpen, false);
  assert.equal(reset.livingSkillId, null);
  assert.deepEqual(reset.canvas, { open: false, skillId: null, view: 'preview', status: 'idle' });
  assert.equal(reset.analysis, null);
  assert.equal(reset.fitReport, null);
  assert.deepEqual(reset.messages, []);
  assert.deepEqual(await createAiSessionStore({ db }).getState().loadSession('resume'), reset);
});

test('submitted form answers survive local reload without mutating the pending card', async () => {
  const db = new MemoryDb();
  const pending: ChatMessage = { id: 'education', role: 'widget', widget: { widgetId: 'education', kind: 'request_form', props: { formKind: 'create_education' }, status: 'pending' } };
  const store = createAiSessionStore({ db });
  store.getState().patchSession('resume', { messages: [pending] });
  const submitted = settleWidgetInMessages([pending], 'education', 'submitted', { school: 'Example Lantern University' });
  store.getState().patchSession('resume', { messages: submitted });
  await store.getState().flushSession('resume');
  const restored = await createAiSessionStore({ db }).getState().loadSession('resume');
  assert.equal(restored.messages[0].widget?.status, 'submitted');
  assert.deepEqual(restored.messages[0].widget?.submittedValues, { school: 'Example Lantern University' });
  assert.equal(pending.widget?.status, 'pending');
});

test('adopting regenerated history replaces the single saved snapshot', async () => {
  const db = new MemoryDb();
  const store = createAiSessionStore({ db });
  const old = store.getState().patchSession('resume', { messages: [{ id: 'old', role: 'user', content: 'Old question' }, { id: 'reply', role: 'assistant', content: 'Old answer' }] });
  const replacement = { ...old, sessionId: 'example-regenerated', messages: old.messages.slice(0, 1) };
  assert.equal(store.getState().adoptSession('resume', replacement), replacement);
  await store.getState().flushSession('resume');
  assert.deepEqual(await createAiSessionStore({ db }).getState().loadSession('resume'), replacement);
  assert.equal(db.items.size, 1);
});

test('an in-flight load cannot overwrite a newer local edit', async () => {
  const db = new MemoryDb();
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const store = createAiSessionStore({ db: { ...db, setItem: db.setItem.bind(db), removeItem: db.removeItem.bind(db), getItem: async () => { await waiting; return null; } } });
  const loading = store.getState().loadSession('resume');
  const edited = store.getState().patchSession('resume', { messages: [{ id: 'new', role: 'user', content: 'New question' }] });
  release();
  assert.equal(await loading, edited);
  await store.getState().flushSession('resume');
});
