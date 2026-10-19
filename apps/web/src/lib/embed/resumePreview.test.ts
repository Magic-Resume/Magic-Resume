import assert from 'node:assert/strict';
import test from 'node:test';
import { adminOrigins, isAllowedParent, previewResume } from './resumePreview';

test('admin origins keep only parsable http(s) origins', () => {
  assert.deepEqual(
    adminOrigins(
      ' https://admin.magic-resume.cn/resumes , javascript:alert(1), nope,http://beta.admin.example:8080',
    ),
    ['https://admin.magic-resume.cn', 'http://beta.admin.example:8080'],
  );
  assert.deepEqual(adminOrigins(undefined), []);
});

test('only listed origins may send a resume in production', () => {
  const allowed = ['https://admin.magic-resume.cn'];
  assert.equal(
    isAllowedParent('https://admin.magic-resume.cn', allowed, false),
    true,
  );
  assert.equal(isAllowedParent('https://evil.example', allowed, false), false);
  assert.equal(isAllowedParent('http://localhost:3001', allowed, false), false);
  assert.equal(isAllowedParent('http://localhost:3001', [], true), true);
  assert.equal(isAllowedParent('https://evil.example', [], true), false);
  assert.equal(isAllowedParent('null', [], true), false);
});

test('version content becomes a renderable resume', () => {
  const resume = previewResume('{"template":"classic"}');
  assert.equal(resume?.template, 'classic');
  assert.equal(resume?.id, 'preview');
  assert.deepEqual(resume?.sections, {});
  assert.deepEqual(resume?.sectionOrder, []);
  assert.equal(previewResume('not json'), null);
  assert.equal(previewResume([1, 2]), null);
  assert.equal(previewResume(null), null);
});
