import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResume } from '@magic-resume-kit/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import { getSanitizedResume, useResumeStore } from './useResumeStore';

const resume: Resume = {
  ...defaultResume,
  id: 'document-language-test',
  updatedAt: 1,
  documentLanguage: 'zh',
  documentLanguageSource: 'explicit',
  sectionOrder: [
    { key: 'projects', label: 'sections.projects', title: '开源贡献' },
  ],
};
test('local sanitization retains language and heading overrides', () => {
  const stored = JSON.parse(JSON.stringify(getSanitizedResume(resume)));
  assert.equal(stored.documentLanguage, 'zh');
  assert.equal(stored.documentLanguageSource, 'explicit');
  assert.equal(
    stored.sectionOrder.find(
      (entry: { key: string }) => entry.key === 'projects',
    ).title,
    '开源贡献',
  );
});
test('whole-resume apply updates language and content atomically', () => {
  useResumeStore.setState({ activeResume: resume, resumes: [resume] });
  const snapshots: Resume[] = [];
  const unsubscribe = useResumeStore.subscribe((state) => {
    if (state.activeResume) snapshots.push(state.activeResume);
  });
  useResumeStore.getState().applyFullResume({
    ...resume,
    documentLanguage: 'en',
    info: { ...resume.info, headline: 'Engineer' },
  });
  unsubscribe();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].documentLanguage, 'en');
  assert.equal(snapshots[0].info.headline, 'Engineer');
  assert.equal(snapshots[0].documentLanguageSource, 'explicit');
  assert.equal(snapshots[0].sectionOrder.find((entry) => entry.key === 'projects')?.title, '开源贡献');
});
