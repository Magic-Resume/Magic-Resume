import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_PROVIDERS } from '@/lib/constants/modals';
import i18n from '@/i18n';
import { connectionTestText, testImageSupportForModel } from './connectionTestResult';

test('a measured image capability takes precedence over the preset in both directions', () => {
  const imageModel = MODEL_PROVIDERS.flatMap((provider) => provider.models).find((model) => model.supportsImage)!;
  const textModel = MODEL_PROVIDERS.flatMap((provider) => provider.models).find((model) => !model.supportsImage)!;
  assert.equal(testImageSupportForModel(false, imageModel.id), false);
  assert.equal(testImageSupportForModel(true, textModel.id), true);
  assert.equal(testImageSupportForModel(undefined, imageModel.id), true);
  assert.equal(testImageSupportForModel(undefined, textModel.id), false);
  assert.equal(testImageSupportForModel(undefined, 'example-unknown-model'), undefined);
});

test('connection success labels explicitly distinguish image support and lack of support', () => {
  const t = i18n.t.bind(i18n);
  assert.equal(connectionTestText('12ms', true, t), '12ms · 支持图片');
  assert.equal(connectionTestText('12ms', false, t), '12ms · 不支持图片');
  assert.equal(connectionTestText('', true, t), `${t('settings.llm.testConnected')} · 支持图片`);
  assert.equal(connectionTestText('', false, t), `${t('settings.llm.testConnected')} · 不支持图片`);
  assert.equal(connectionTestText('', undefined, t), t('settings.llm.testConnected'));
});
