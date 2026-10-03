import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResume, resumeSchema, resumeJsonSchema, detectDocumentLanguage, resolveDocumentLanguage, normalizeDocumentLanguage, documentSectionTitle } from '../dist/index.js';

const prose = (summary) => ({ sections: { experience: [{ summary }] } });
test('detects prose without mistaking technology keywords for English', () => {
  assert.equal(detectDocumentLanguage(prose('<p>使用 React TypeScript Next.js Tailwind CSS 构建协作编辑器并优化用户体验。</p>')), 'zh');
  assert.equal(detectDocumentLanguage(prose('Built a collaborative editor and improved rendering performance across the application.')), 'en');
  assert.equal(detectDocumentLanguage(prose('ウェブアプリケーションの設計と開発を担当しました。')), 'ja');
  assert.equal(detectDocumentLanguage(prose('웹 애플리케이션 개발과 성능 개선을 담당했습니다.')), 'ko');
  assert.equal(detectDocumentLanguage(prose('Développement des applications pour une équipe avec gestion des projets.')), 'fr');
  assert.equal(detectDocumentLanguage({ sections: { skills: [{ summary: 'React TypeScript Next JavaScript HTML CSS Node Redis Postgres' }] } }), undefined);
  assert.equal(detectDocumentLanguage(prose('React')), undefined);
});
test('explicit document language wins and legacy fallback is deterministic', () => {
  assert.equal(resolveDocumentLanguage({ ...prose('负责开发产品与优化性能体验'), documentLanguage: 'en' }), 'en');
  assert.equal(resolveDocumentLanguage({}), 'zh');
  assert.equal(normalizeDocumentLanguage('English'), 'en');
  assert.equal(normalizeDocumentLanguage('zh-CN'), 'zh');
  assert.equal(normalizeDocumentLanguage('ja_JP'), 'ja');
});
test('schema round-trips document metadata and custom titles', () => {
  const resume = { ...defaultResume, documentLanguage: 'en', documentLanguageSource: 'explicit', sectionOrder: [{ key: 'projects', label: 'sections.projects', title: 'Selected Work', icon: 'folder' }] };
  const parsed = resumeSchema.parse(resume);
  assert.equal(parsed.documentLanguage, 'en');
  assert.deepEqual(parsed.sectionOrder, resume.sectionOrder);
  assert.equal(parsed.documentLanguageSource, 'explicit');
  assert.equal(resumeSchema.safeParse({ ...resume, documentLanguage: 'invalid' }).success, false);
  assert.ok(resumeJsonSchema.properties.documentLanguage.enum.includes('fr'));
  assert.equal(documentSectionTitle('projects', 'en'), 'Projects');
});
