import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { MemorySaver } from '@langchain/langgraph';
import { defaultResume } from '@magic-resume-kit/resume-schema';
import { readSettings } from '../src/config.js';
import { buildServer } from '../src/server.js';
import { startFakeModel, type Script } from './fake-model.js';
import type { AgentEvent } from '../src/contracts/events.js';
export const resume = {
  ...defaultResume,
  name: 'Example resume',
  info: {
    ...defaultResume.info,
    fullName: 'Alex Chen',
    headline: 'Engineer',
    email: 'alex@example.com',
  },
  sections: {
    ...defaultResume.sections,
    experience: [
      {
        id: 'example-role',
        visible: true,
        company: 'Example Labs',
        position: 'Engineer',
        summary: '<p>Built accessible interfaces.</p>',
        date: '2022 - 2024',
      },
    ],
  },
  documentLanguage: 'en',
  documentLanguageSource: 'explicit',
};
export const improved = {
  ...resume,
  info: { ...resume.info, headline: 'Frontend Engineer' },
};
export function frames(raw: string): AgentEvent[] {
  const parsed = raw
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as AgentEvent & {
          protocolVersion: number;
          streamSequence: number;
          runId: string;
        },
    );
  parsed.forEach((event, index) => {
    assert.equal(event.protocolVersion, 1);
    assert.equal(event.streamSequence, index + 1);
    assert.equal(event.runId, parsed[0].runId);
  });
  assert.equal(parsed[0]?.type, 'run_started', raw);
  assert.equal(parsed.at(-1)?.type, 'done', raw);
  return parsed;
}
export async function waitFor(predicate: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'expected state before timeout');
    await delay(10);
  }
}
export async function fixture(
  t: TestContext,
  storage: 'memory' | 'sqlite' = 'memory',
  scripts: Script[] = [],
  env: NodeJS.ProcessEnv = {},
) {
  const dataDir = await mkdtemp(join(tmpdir(), 'resume-agent-'));
  const fake = await startFakeModel(0, scripts);
  const settings = readSettings({
    NODE_ENV: 'test',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
    AGENT_DATA_DIR: dataDir,
    ...env,
  });
  const memory = storage === 'memory' ? new MemorySaver() : undefined;
  let app = buildServer({ settings, checkpointer: memory });
  let origin = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await app.close();
    await fake.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const body = (override: Record<string, unknown> = {}) => ({
    messages: [{ role: 'user', content: 'Help with this resume.' }],
    agentMode: 'cocreate',
    currentResume: resume,
    config: {
      apiKey: 'example-test-key',
      baseUrl: fake.baseUrl,
      modelName: 'example-model',
    },
    ...override,
  });
  const post = (path: string, value: unknown, signal?: AbortSignal) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal,
    });
  return {
    fake,
    body,
    post,
    settings,
    dataDir,
    get app() {
      return app;
    },
    get origin() {
      return origin;
    },
    async restart() {
      await app.close();
      app = buildServer({ settings, checkpointer: memory });
      origin = await app.listen({ host: '127.0.0.1', port: 0 });
    },
    async chat(value?: unknown, signal?: AbortSignal) {
      const response = await post('/api/chat', value ?? body(), signal);
      assert.equal(response.status, 200, await response.clone().text());
      return frames(await response.text());
    },
    async state(sessionId: string) {
      return (
        await (
          await fetch(`${origin}/api/chat/session?sessionId=${sessionId}`)
        ).json()
      ).data;
    },
  };
}
