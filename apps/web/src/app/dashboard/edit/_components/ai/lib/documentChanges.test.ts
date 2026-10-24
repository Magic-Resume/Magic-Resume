import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResume } from '@magic-resume/resume-schema';
import { applyDocumentChange, diffDocumentChanges } from './documentChanges';
import { diffInfoToChanges } from './diffResume';
import { normalizeResumeSectionOrder } from '@/lib/utils/resumeSectionOrder';

const current = {
  ...defaultResume,
  id: 'language-test',
  updatedAt: 0,
  documentLanguage: 'zh' as const,
  documentLanguageSource: 'explicit' as const,
};
test('full translation proposes language without mutating the saved document', () => {
  const changes = diffDocumentChanges(
    current,
    {},
    { kind: 'translate', lang: 'English' },
  );
  assert.equal(changes.length, 1);
  assert.equal(current.documentLanguage, 'zh'); // discard means no write
  const next = applyDocumentChange(current, changes[0].documentChange!);
  assert.equal(next?.documentLanguage, 'en');
  assert.equal(next?.documentLanguageSource, 'explicit');
  assert.equal(current.documentLanguage, 'zh');
});
test('selection translation cannot propose language or section title changes', () => {
  assert.deepEqual(
    diffDocumentChanges(
      current,
      { documentLanguage: 'en', sectionOrder: [] },
      {
        kind: 'translate',
        lang: 'English',
        targetedSelection: {
          path: 'sections.projects[p1].summary',
          selectionText: '文本',
        },
      },
    ),
    [],
  );
});
test('metadata changes use CAS and preserve renamed headings through normalization', () => {
  const [language] = diffDocumentChanges(
    current,
    { documentLanguage: 'en' },
    { kind: 'translate' },
  );
  assert.equal(
    applyDocumentChange(
      { ...current, documentLanguage: 'ja' },
      language.documentChange!,
    ),
    null,
  );
  const order = [
    {
      key: 'projects',
      label: 'sections.projects',
      title: 'Open Source',
      icon: 'folder',
    },
  ];
  const [heading] = diffDocumentChanges(
    current,
    { sectionOrder: order },
    { kind: 'optimize' },
  );
  const next = applyDocumentChange(current, heading.documentChange!);
  assert.equal(next?.sectionOrder[0].title, 'Open Source');
  assert.equal(
    normalizeResumeSectionOrder(next!.sectionOrder, next!.sections).find(
      (entry) => entry.key === 'projects',
    )?.title,
    'Open Source',
  );
});
test('whole-document review includes translated basic information', () => {
  const changes = diffInfoToChanges(
    { ...current.info, headline: '前端工程师' },
    { ...current.info, headline: 'Frontend Engineer' },
    'translate',
    'English',
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].target.sectionKey, 'info');
  assert.equal(changes[0].after, 'Frontend Engineer');
});
