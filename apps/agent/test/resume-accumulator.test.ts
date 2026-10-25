import assert from 'node:assert/strict';
import test from 'node:test';
import { ResumeAccumulator } from '../src/engine/resume-accumulator.js';
import {
  seedResume,
  readFile,
  readResume,
} from '../src/harness/workspace/files.js';
import { resume, improved } from './helpers.js';
test('workspace source roundtrips and proposal accumulation compares each accepted write with the previous source', () => {
  assert.deepEqual(readResume(seedResume(resume)), resume);
  assert.equal(readFile({}, '/missing'), undefined);
  const accumulator = new ResumeAccumulator(resume, 'cocreate');
  assert.deepEqual(accumulator.accept(resume), []);
  const first = accumulator.accept(improved)[0];
  assert.equal(first.type, 'resume_patch');
  if (first.type === 'resume_patch')
    assert.deepEqual(first.payload.patch, [
      { op: 'replace', path: '/info/headline', value: improved.info.headline },
    ]);
  const changedAgain = {
    ...improved,
    info: { ...improved.info, headline: 'Accessible Frontend Engineer' },
  };
  const second = accumulator.accept(changedAgain)[0];
  if (second.type === 'resume_patch')
    assert.deepEqual(second.payload.patch, [
      {
        op: 'replace',
        path: '/info/headline',
        value: changedAgain.info.headline,
      },
    ]);
  const final = accumulator.finalize();
  assert.equal(final.length, 1);
  assert.deepEqual(accumulator.finalize(), []);
});
test('invalid writes and read-only modes never produce patches or snapshots; reverting to baseline is unchanged', () => {
  for (const mode of ['ask', 'plan'] as const) {
    const accumulator = new ResumeAccumulator(resume, mode);
    assert.deepEqual(accumulator.accept(improved), []);
    assert.deepEqual(accumulator.finalize(), []);
  }
  const invalid = new ResumeAccumulator(resume, 'cocreate');
  assert.deepEqual(invalid.accept({ info: { fullName: 123 } }), []);
  assert.deepEqual(invalid.finalize(), []);
  const reverted = new ResumeAccumulator(resume, 'cocreate');
  reverted.accept(improved);
  reverted.accept(resume);
  assert.deepEqual(reverted.finalize(), []);
});

test('generated patches work in the actual frontend projection while preserving browser-only metadata', async () => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { parseChatRequest } = await import('../src/contracts/requests.js');
  const normalized = parseChatRequest({
    messages: [{ role: 'user', content: 'Improve the headline.' }],
    currentResume: {
      info: resume.info,
      sections: resume.sections,
      sectionOrder: resume.sectionOrder,
    },
    config: {
      apiKey: 'example-test-key',
      baseUrl: 'https://model.example.com/v1',
      modelName: 'example-model',
    },
  }).currentResume!;
  const accumulator = new ResumeAccumulator(normalized, 'cocreate');
  const next = {
    ...normalized,
    info: { ...normalized.info, headline: 'Frontend Engineer' },
  };
  const events = accumulator.accept(next);
  const browser = {
    ...resume,
    id: 'example-browser-resume',
    name: 'Browser-owned name',
    themeColor: '#123456',
  };
  const script = `import assert from 'node:assert/strict'; import projection from ${JSON.stringify(new URL('../../web/src/app/dashboard/edit/_components/ai/lib/resumePatch.ts', import.meta.url).href)}; const { ResumePatchProjection } = projection; const result = new ResumePatchProjection(${JSON.stringify(browser)}).accept(${JSON.stringify(events[0].type === 'resume_patch' ? events[0].payload : {})}); assert.ok(result); assert.equal(result.proposedDocument.info.headline, 'Frontend Engineer'); assert.equal(result.proposedDocument.id, 'example-browser-resume'); assert.equal(result.proposedDocument.name, 'Browser-owned name'); assert.equal(result.proposedDocument.themeColor, '#123456');`;
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script],
    {
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: fileURLToPath(
          new URL('../../web/tsconfig.json', import.meta.url),
        ),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let error = '';
  child.stderr.on('data', (data) => {
    error += data;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 0, error);
});
