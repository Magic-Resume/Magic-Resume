import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MemoryDb } from '../../scripts/test-memory-db';
import { dbClient } from '@/lib/api/IndexDBClient';
import { isProtectedApiKey, protectApiKey, revealApiKey } from '@/lib/security/byokVault';
import { CUSTOM_PROVIDER_ID, MODEL_PROVIDERS } from '@/lib/constants/modals';
import { useSettingStore } from './useSettingStore';

function isolate(t: TestContext) {
  const original = useSettingStore.getState();
  t.after(() => useSettingStore.setState(original, true));
  const db = new MemoryDb();
  t.mock.method(dbClient, 'getItem', db.getItem.bind(db));
  t.mock.method(dbClient, 'setItem', db.setItem.bind(db));
  useSettingStore.setState({ provider: 'custom', apiKey: 'example-test-key', baseUrl: 'https://model.example.com/v1', model: 'example-model', maxTokens: 4096, strength: 'medium', isDirty: true });
  return db;
}

test('saving encrypts the key with a non-exportable key and loading restores the BYOK configuration', async (t) => {
  const db = isolate(t);
  await useSettingStore.getState().saveSettings();
  const saved = await db.getItem<Record<string, unknown>>('settings');
  assert.ok(saved);
  assert.equal(isProtectedApiKey(saved.apiKey), true);
  assert.notEqual(saved.apiKey, 'example-test-key');
  assert.ok(!JSON.stringify(saved).includes('example-test-key'));
  const encryptionKey = await db.getItem<CryptoKey>('settings_byok_crypto_key');
  assert.equal(encryptionKey?.algorithm.name, 'AES-GCM');
  assert.equal(encryptionKey?.extractable, false);
  assert.equal(useSettingStore.getState().isDirty, false);
  useSettingStore.getState().setApiKey('Unsaved example key');
  await useSettingStore.getState().loadSettings();
  assert.equal(useSettingStore.getState().apiKey, 'example-test-key');
  assert.equal(useSettingStore.getState().baseUrl, 'https://model.example.com/v1');
  assert.equal(useSettingStore.getState().model, 'example-model');
  assert.equal(useSettingStore.getState().initialSettings.apiKey, 'example-test-key');
  assert.equal(useSettingStore.getState().isDirty, false);
});

test('encryption uses fresh IVs and refuses a missing or tampered key', async (t) => {
  const db = isolate(t);
  const first = await protectApiKey('example-test-key');
  const second = await protectApiKey('example-test-key');
  assert.notEqual(first, second);
  assert.deepEqual(await revealApiKey(first), { apiKey: 'example-test-key', legacyPlaintext: false });
  const parts = first.split('.');
  const bytes = Buffer.from(parts[2], 'base64');
  bytes[0] ^= 1;
  await assert.rejects(revealApiKey(`${parts[0]}.${parts[1]}.${bytes.toString('base64')}`));
  await db.removeItem('settings_byok_crypto_key');
  await assert.rejects(revealApiKey(first), /BYOK encryption key is missing/);
});

test('legacy plaintext is encrypted on read and a missing provider is derived from the saved URL', async (t) => {
  const db = isolate(t);
  const preset = MODEL_PROVIDERS.find((provider) => provider.baseUrl)!;
  await db.setItem('settings', { apiKey: 'example-legacy-key', baseUrl: preset.baseUrl, model: 'example-model', maxTokens: 4096, ignoredLegacyField: 'example' });
  await useSettingStore.getState().loadSettings();
  assert.equal(useSettingStore.getState().provider, preset.id);
  assert.equal(useSettingStore.getState().apiKey, 'example-legacy-key');
  const migrated = await db.getItem<Record<string, unknown>>('settings');
  assert.equal(isProtectedApiKey(migrated?.apiKey), true);
  assert.equal(migrated?.ignoredLegacyField, undefined);
});

test('an empty API key needs no encryption key and remains unconfigured', async (t) => {
  const db = isolate(t);
  useSettingStore.getState().setApiKey('');
  await useSettingStore.getState().saveSettings();
  assert.equal((await db.getItem<{ apiKey: string }>('settings'))?.apiKey, '');
  assert.equal(await db.getItem('settings_byok_crypto_key'), null);
  assert.deepEqual(await revealApiKey(''), { apiKey: '', legacyPlaintext: false });
  assert.equal(useSettingStore.getState().hasLlmConfig(), false);
});

test('hasLlmConfig requires every connection field and a finite positive token limit', (t) => {
  isolate(t);
  const valid = { provider: 'custom', apiKey: 'example-test-key', baseUrl: 'https://model.example.com/v1', model: 'example-model', maxTokens: 4096 };
  assert.equal(useSettingStore.getState().hasLlmConfig(), true);
  for (const field of ['provider', 'apiKey', 'baseUrl', 'model'] as const) {
    for (const value of ['', '   ']) {
      useSettingStore.setState({ ...valid, [field]: value });
      assert.equal(useSettingStore.getState().hasLlmConfig(), false, field);
    }
  }
  for (const maxTokens of [0, -1, NaN, Infinity]) {
    useSettingStore.setState({ ...valid, maxTokens });
    assert.equal(useSettingStore.getState().hasLlmConfig(), false);
  }
  useSettingStore.setState(valid);
  assert.equal(useSettingStore.getState().hasLlmConfig(), true);
});

test('provider presets fill connection defaults while custom preserves user edits', (t) => {
  isolate(t);
  for (const preset of MODEL_PROVIDERS.filter((provider) => provider.id !== CUSTOM_PROVIDER_ID)) {
    useSettingStore.getState().setProvider(preset.id);
    const state = useSettingStore.getState();
    assert.equal(state.baseUrl, preset.baseUrl);
    assert.equal(state.model, preset.defaultModel);
    assert.equal(state.maxTokens, preset.defaultMaxTokens);
    assert.equal(state.apiKey, 'example-test-key');
  }
  const custom = { baseUrl: 'https://model.example.com/v1', model: 'example-user-model', maxTokens: 2048 };
  useSettingStore.setState(custom);
  useSettingStore.getState().setProvider(CUSTOM_PROVIDER_ID);
  assert.equal(useSettingStore.getState().baseUrl, custom.baseUrl);
  assert.equal(useSettingStore.getState().model, custom.model);
  assert.equal(useSettingStore.getState().maxTokens, custom.maxTokens);
});

test('failed persistence retains the unsaved state and reset returns to the last saved configuration', async (t) => {
  isolate(t);
  await useSettingStore.getState().saveSettings();
  useSettingStore.getState().setApiKey('example-unsaved-key');
  t.mock.method(dbClient, 'setItem', async () => { throw new Error('Example storage failure'); });
  await assert.rejects(useSettingStore.getState().saveSettings(), /Example storage failure/);
  assert.equal(useSettingStore.getState().isDirty, true);
  assert.equal(useSettingStore.getState().initialSettings.apiKey, 'example-test-key');
  useSettingStore.getState().resetSettings();
  assert.equal(useSettingStore.getState().apiKey, 'example-test-key');
  assert.equal(useSettingStore.getState().isDirty, false);
});
