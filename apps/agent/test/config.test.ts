import assert from 'node:assert/strict';
import test from 'node:test';
import { readSettings } from '../src/config.js';
import { parseModelConfig } from '../src/contracts/model-config.js';
import { AgentError } from '../src/contracts/errors.js';
import { parseChatRequest } from '../src/contracts/requests.js';

const config = {
  apiKey: 'example-test-key',
  baseUrl: 'https://model.example.com/v1',
  modelName: 'example-model',
};

test('model settings require BYOK credentials and a complete HTTP endpoint', () => {
  assert.equal(parseModelConfig(config).source, 'byok');
  assert.equal(
    parseModelConfig({
      ...config,
      source: 'byok',
      baseUrl: `${config.baseUrl}/`,
    }).baseUrl,
    config.baseUrl,
  );
  for (const field of ['apiKey', 'baseUrl', 'modelName'] as const) {
    for (const missing of [undefined, '', '   ']) {
      assert.throws(
        () => parseModelConfig({ ...config, [field]: missing }),
        AgentError,
      );
    }
  }
  for (const invalid of [
    { source: 'internal' },
    { effort: 'maximum' },
    { maxTokens: 0 },
    { maxTokens: 1.5 },
    { maxTokens: '100' },
    { apiKey: 'example\r\nvalue' },
    { baseUrl: 'file:///etc/hosts' },
    { baseUrl: 'https://user:secret@model.example.com' },
    { baseUrl: 'https://model.example.com/v1?key=example' },
    { baseUrl: 'https://model.example.com/v1#fragment' },
  ]) {
    assert.throws(
      () => parseModelConfig({ ...config, ...invalid }),
      AgentError,
    );
  }
  assert.throws(() => parseModelConfig(undefined), AgentError);
  assert.deepEqual(
    parseModelConfig({ ...config, effort: 'high', maxTokens: 512 }),
    {
      ...config,
      source: 'byok',
      effort: 'high',
      maxTokens: 512,
    },
  );
});

test('private model endpoints require an explicit non-production flag', () => {
  assert.equal(readSettings({}).host, '127.0.0.1');
  assert.equal(readSettings({}).port, 4000);
  for (const NODE_ENV of ['development', 'test']) {
    assert.equal(readSettings({ NODE_ENV }).allowPrivateModelHosts, false);
    assert.equal(
      readSettings({ NODE_ENV, AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true' })
        .allowPrivateModelHosts,
      true,
    );
  }
  const production = readSettings({
    NODE_ENV: 'production',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
  });
  assert.equal(production.privateHostsRequested, true);
  assert.equal(production.allowPrivateModelHosts, false);
});

test('chat validates its text transcript and accepts unused contract fields', () => {
  const chat = { config, messages: [{ role: 'user', content: 'Hello' }] };
  for (const invalid of [
    { messages: [] },
    { messages: [{ role: 'tool', content: 'Hello' }] },
    { messages: [{ role: 'user', content: {} }] },
    { agentMode: 'unknown' },
    { currentResume: { info: {} } },
  ]) {
    assert.throws(() => parseChatRequest({ ...chat, ...invalid }), AgentError);
  }
  const request = parseChatRequest({
    ...chat,
    agentMode: 'ask',
    currentResume: 'ignored',
    resumeId: 'example-resume',
    mode: 'general',
    sessionId: 'example-session',
    turnId: 'example-turn',
    userSkillIds: ['example-skill'],
    attachments: [
      {
        id: 'example-attachment',
        name: 'example.pdf',
        contentType: 'application/pdf',
        sourceUrl: 'https://documents.example.com/example.pdf',
      },
    ],
    context: { example: true },
  });
  assert.equal(request.currentResume, undefined);
  assert.equal(request.resumeId, undefined);
});
