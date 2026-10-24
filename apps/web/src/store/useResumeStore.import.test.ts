import assert from 'node:assert/strict';
import test from 'node:test';
import { useResumeStore, initialResume } from './useResumeStore';
import { dbClient, RESUMES_KEY } from '../lib/api/IndexDBClient';
import type { Resume } from '../types/frontend/resume';

const fixture = (id: string): Resume => ({ ...structuredClone(initialResume), id, name: id, updatedAt: 1 });

test('cold import and creation preserve stored resumes and await durable writes', async (t) => {
  const rows = new Map<string, unknown>([[RESUMES_KEY, [fixture('existing')]]]);
  t.mock.method(dbClient, 'getItem', async (key: string) => rows.get(key) ?? null);
  t.mock.method(dbClient, 'setItem', async (key: string, value: unknown) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    rows.set(key, structuredClone(value));
  });
  useResumeStore.setState({ resumes: [], isStoreLoading: true, activeResume: null });
  await useResumeStore.getState().importResume(fixture('imported'));
  assert.deepEqual((rows.get(RESUMES_KEY) as Resume[]).map((r) => r.id), ['imported', 'existing']);
  useResumeStore.setState({ resumes: [], isStoreLoading: true });
  const id = await useResumeStore.getState().createResume('Created');
  assert.deepEqual((rows.get(RESUMES_KEY) as Resume[]).map((r) => r.id), [id, 'imported', 'existing']);
});

test('storage failure cannot overwrite existing resumes or report an import as saved', async (t) => {
  const write = t.mock.method(dbClient, 'setItem', async () => {});
  t.mock.method(dbClient, 'getItem', async () => { throw new Error('storage unavailable'); });
  useResumeStore.setState({ resumes: [], isStoreLoading: true, activeResume: null });
  await assert.rejects(useResumeStore.getState().importResume(fixture('imported')), /storage unavailable/);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(useResumeStore.getState().resumes.length, 0);
});
