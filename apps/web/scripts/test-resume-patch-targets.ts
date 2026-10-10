import assert from 'node:assert/strict';
import { resolveResumePatchEvent } from '../src/app/dashboard/edit/_components/ai/lib/resumePatch';
import type { Resume } from '../src/types/frontend/resume';

const resume = { sections: {
  experience: [{ id: 'experience-1', summary: '<p>Node.js</p>' }],
  projects: [{ id: 'project-1', name: 'Editor', summary: '<p>Node.js</p>' }],
} } as unknown as Resume;
const patch = { oldString: 'Node.js', newString: '<strong>Node.js</strong>' };

assert.equal(resolveResumePatchEvent(resume, patch), null,
  'a shared technical term must not map to the first matching paragraph');
const target = { path: 'sections.projects[project-1].summary', selectionText: 'Node.js' };
const exact = resolveResumePatchEvent(resume, patch, target);
assert.ok(exact);
assert.equal(exact.resume.sections.experience[0].summary, '<p>Node.js</p>');
assert.equal(exact.resume.sections.projects[0].summary, '<p><strong>Node.js</strong></p>');
assert.equal(resolveResumePatchEvent(resume, patch, { path: 'sections.projects[missing].summary', selectionText: 'Node.js' }), null,
  'a missing explicit target must not fall back to an unrelated field');
const repeated = { sections: { projects: [{ id: 'project-1', summary: '<p>Node.js first</p><p>Node.js second</p>' }] } } as unknown as Resume;
assert.equal(resolveResumePatchEvent(repeated, patch, target), null,
  'a repeated phrase in one field has no unique paragraph target');
const unique = resolveResumePatchEvent(resume, { oldString: 'Editor', newString: 'Resume Editor' });
assert.equal(unique?.resume.sections.projects[0].name, 'Resume Editor');
assert.equal(resolveResumePatchEvent(resume, { oldString: 'project-1', newString: 'changed-id' }), null,
  'identifier fields are never editable text matches');
console.log('Resume patch target regression checks passed (6 cases).');
