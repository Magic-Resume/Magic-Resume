import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real queue with deterministic IndexedDB/network interleavings.
const source = readFileSync(new URL('../src/lib/api/conversationSync.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

function harness(onAppend?: (message: Record<string, unknown>) => Promise<void>) {
  let queue: unknown[] = [];
  let id = 0;
  const uploaded: Record<string, unknown>[] = [];
  const exports = {} as {
    enqueueMessage: (message: Record<string, unknown>) => Promise<void>;
    flush: () => Promise<void>;
  };
  vm.runInNewContext(code, {
    exports, Date, Set, Promise,
    require: (name: string) => {
      if (name === './IndexDBClient') return { dbClient: {
        getItem: async () => structuredClone(queue),
        setItem: async (_key: string, value: unknown[]) => { queue = structuredClone(value); },
      } };
      if (name === './conversationApi') return { conversationApi: {
        ensure: async () => undefined,
        appendMessage: async (_id: string, message: Record<string, unknown>) => {
          uploaded.push(structuredClone(message));
          await onAppend?.(message);
        },
      } };
      if (name === 'nanoid') return { nanoid: () => `delivery-${++id}` };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { enqueue: exports.enqueueMessage, flush: exports.flush, uploaded, queue: () => queue };
}

const message = (seq: number, content = `message-${seq}`) => ({ conversationId: 'session', resumeId: 'resume', seq, role: seq === 0 ? 'user' : 'assistant', content });

async function main() {
  const parallel = harness();
  await Promise.all([0, 1, 2].map(seq => parallel.enqueue(message(seq))));
  await parallel.flush();
  assert.deepEqual(parallel.uploaded.map(m => m.seq), [0, 1, 2], 'sealing a turn must upload the user and every assistant/card message');
  assert.equal(parallel.queue().length, 0);

  const entered = deferred();
  const release = deferred();
  let first = true;
  const duringSend = harness(async () => { if (first) { first = false; entered.resolve(); await release.promise; } });
  await duringSend.enqueue(message(0));
  await entered.promise;
  await duringSend.enqueue(message(1));
  release.resolve();
  await duringSend.flush();
  assert.deepEqual(duringSend.uploaded.map(m => m.seq), [0, 1], 'a send acknowledgement must preserve newly enqueued messages');

  const enteredUpdate = deferred();
  const releaseUpdate = deferred();
  let firstUpdate = true;
  const replacement = harness(async () => { if (firstUpdate) { firstUpdate = false; enteredUpdate.resolve(); await releaseUpdate.promise; } });
  await replacement.enqueue(message(1, 'old card'));
  await enteredUpdate.promise;
  await replacement.enqueue(message(1, 'updated card'));
  releaseUpdate.resolve();
  await replacement.flush();
  assert.deepEqual(replacement.uploaded.map(m => m.content), ['old card', 'updated card'], 'acknowledging an old version must not erase a newer card update');
  assert.equal(replacement.queue().length, 0);
  console.log('Conversation sync regression checks passed (3 concurrency cases).');
}
void main();
