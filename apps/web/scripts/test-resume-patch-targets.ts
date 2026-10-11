import assert from 'node:assert/strict';
import { resolveResumePatchEvent, ResumePatchProjection } from '../src/app/dashboard/edit/_components/ai/lib/resumePatch';
import { diffResumeToChanges } from '../src/app/dashboard/edit/_components/ai/lib/diffResume';
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
const quotedPatch = { oldString: JSON.stringify('<p>Node.js</p>'), newString: JSON.stringify('<p><strong>Node.js</strong></p>') };
const serializedField = resolveResumePatchEvent({ sections: { projects: [{ id: 'project-1', summary: '<p>Node.js</p>' }] } } as unknown as Resume, quotedPatch);
assert.equal(serializedField?.resume.sections.projects[0].summary, '<p><strong>Node.js</strong></p>',
  'JSON-serialized VFS edits must match decoded resume fields during streaming');

const base = { sections: { projects: [{ id: 'project-1', summary: '<p>React and Node.js</p>' }], experience: [{ id: 'exp-1', summary: '<p>Redis</p>' }] } } as unknown as Resume;
const stream = new ResumePatchProjection(base);
const first = stream.accept({ oldString: 'React', newString: '<strong>React</strong>' });
const second = stream.accept({ oldString: 'Node.js', newString: '<strong>Node.js</strong>' });
assert.equal(second?.proposedDocument.sections.projects[0].summary, '<p><strong>React</strong> and <strong>Node.js</strong></p>',
  'consecutive patches must retain preceding edits in the same field');
assert.equal(second?.targetedSelection, undefined, 'transport matches must not narrow a whole-resume review');
const third = stream.accept({ oldString: JSON.stringify('<p>Redis</p>'), newString: JSON.stringify('<p><strong>Redis</strong></p>') });
assert.ok(third);
assert.equal(diffResumeToChanges(base.sections, third.proposedSections, 'optimize').length, 2,
  'streaming snapshots include every changed field');
assert.equal(base.sections.projects[0].summary, '<p>React and Node.js</p>', 'preview projection must not change the saved resume');

assert.ok(first);
const selected = new ResumePatchProjection(base).accept({ oldString: 'React', newString: '<strong>React</strong>' }, {
  targetedSelection: { path: 'sections.projects[project-1].summary', selectionText: 'React' },
});
assert.ok(selected?.targetedSelection, 'an actual user selection still scopes the review');
const formatting = diffResumeToChanges(base.sections, selected.proposedSections, 'optimize', undefined, selected.targetedSelection);
assert.equal(formatting[0].previewBefore, undefined, 'formatting-only changes must preserve HTML in the review');
assert.equal(formatting[0].target.kind, 'html');
stream.reconcile(base);
assert.equal(stream.accept({ oldString: 'React', newString: 'Vue' })?.proposedDocument.sections.projects[0].summary, '<p>Vue and Node.js</p>',
  'the authoritative snapshot becomes the next projection base');
console.log('Resume patch target and cumulative-stream regression checks passed.');
