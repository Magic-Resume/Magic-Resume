import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbClient } from './IndexDBClient';

test('server rendering can import and call storage without opening IndexedDB', async () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof indexedDB, 'undefined');
  await dbClient.init();
  await dbClient.setItem('example', { value: 'Example value' });
  assert.equal(await dbClient.getItem('example'), null);
  assert.deepEqual(await dbClient.getAllKeys(), []);
  await dbClient.removeItem('example');
});
