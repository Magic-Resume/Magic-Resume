import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResume } from '@magic-resume/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import { getSanitizedResume, useResumeStore } from './useResumeStore';
import { useSettingStore } from './useSettingStore';
import { buildSyncDoc } from '@/lib/api/resume';
import { buildWorkspacePreparedChanges } from '@/lib/api/workspace';

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
// Node has no IndexedDB; disabling cloud sync keeps this isolated from real data.
useSettingStore.setState({ cloudSync: false });
test('sanitization and sync retain language and heading overrides', () => {
  const stored = JSON.parse(JSON.stringify(getSanitizedResume(resume)));
  assert.equal(stored.documentLanguage, 'zh');
  assert.equal(stored.documentLanguageSource, 'explicit');
  assert.equal(
    stored.sectionOrder.find(
      (entry: { key: string }) => entry.key === 'projects',
    ).title,
    '开源贡献',
  );
  assert.equal(buildSyncDoc(resume).documentLanguage, 'zh');
});
test('whole-resume apply is atomic and version restoration restores document language', () => {
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
  const versioned = {
    ...snapshots[0],
    versions: [
      { id: 'old', updatedAt: 1, type: 'manual' as const, data: resume },
    ],
  };
  useResumeStore.setState({ activeResume: versioned, resumes: [versioned] });
  useResumeStore.getState().restoreVersion('old');
  assert.equal(useResumeStore.getState().activeResume?.documentLanguage, 'zh');
  const legacyData = { ...resume };
  delete legacyData.documentLanguage;
  delete legacyData.documentLanguageSource;
  const legacy = {
    ...versioned,
    versions: [
      { id: 'legacy', updatedAt: 1, type: 'manual' as const, data: legacyData },
    ],
  };
  useResumeStore.setState({ activeResume: legacy, resumes: [legacy] });
  useResumeStore.getState().restoreVersion('legacy');
  assert.equal(
    useResumeStore.getState().activeResume?.documentLanguage,
    undefined,
  );
});
test('workspace inventory includes language and custom titles alongside translated content', async () => {
  const next = {
    ...resume,
    documentLanguage: 'en',
    info: { ...resume.info, headline: 'Engineer' },
    sectionOrder: resume.sectionOrder.map((entry) => ({
      ...entry,
      title: 'Open Source',
    })),
  };
  const changes = await buildWorkspacePreparedChanges(resume, next);
  const language = changes.find((change) => change.target.scope === 'document');
  assert.equal(language?.after, 'en');
  assert.match(language!.beforeHash, /^[a-f0-9]{64}$/);
  assert.ok(changes.some((change) => change.target.scope === 'info'));
  assert.ok(changes.some((change) => change.target.scope === 'sectionOrder'));
});
