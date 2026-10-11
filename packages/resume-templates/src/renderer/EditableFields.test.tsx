import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditableCanvasProvider, type EditableCanvasContextValue } from './EditableCanvas';
import { DefaultSection } from '../templateLayout/DefaultSection';
import { Timeline } from '../templateLayout/Timeline';
import { ThreeColumnSection } from '../templateLayout/ThreeColumnSection';
import { ListSection } from '../templateLayout/ListSection';
import { EditableField } from '../templateLayout/EditableField';

const context: EditableCanvasContextValue = {
  enabled: true, pendingByPath: {}, processingPaths: [], errorsByPath: {}, activePath: null,
  onHandleClick() {}, onAccept() {}, onDiscard() {}, onRegenerate() {}, onRetry() {}, onSectionHandleClick() {}, onCommit() {},
};
const item = { id: 'project-1', name: 'Editor', role: 'Developer', date: '2024–2025', description: '<p>Built an editor.</p>' };
const props = { title: 'Projects', sectionKey: 'projects', items: [item] };
const layouts = [
  <DefaultSection {...props} fieldMap={{ mainTitle: ['title', 'name'], mainSubtitle: 'role', sideTitle: 'date', description: ['summary', 'description'] }} />,
  <Timeline {...props} fieldMap={{ title: ['title', 'name'], subtitle: 'role', date: 'date', description: ['summary', 'description'] }} />,
  <ThreeColumnSection {...props} fieldMap={{ leftTitle: ['title', 'name'], centerTitle: 'role', rightTitle: 'date', description: ['summary', 'description'] }} />,
  <ListSection {...props} fieldMap={{ itemName: ['title', 'name'], itemDetail: 'role', date: 'date', summary: ['summary', 'description'] }} />,
];

test('entry layouts bind names, dates and fallback descriptions to their real fields', () => {
  for (const layout of layouts) {
    const html = renderToStaticMarkup(<EditableCanvasProvider value={context}>{layout}</EditableCanvasProvider>);
    for (const key of ['name', 'role', 'date', 'description']) {
      assert.ok(html.includes(`data-resume-path="sections.projects[project-1].${key}"`), `Missing writable ${key}`);
    }
    assert.ok(!html.includes('sections.projects[project-1].title'), 'Fallback must write to name, not the empty title alias');
    assert.ok(html.includes('data-resume-kind="text"'));
  }
});

test('read-only resumes have no editing anchors or add controls', () => {
  for (const layout of layouts) {
    const html = renderToStaticMarkup(layout);
    assert.ok(!html.includes('data-resume-path'));
    assert.ok(!html.includes('lc-section-handle'));
    assert.ok(html.includes('Editor'));
    assert.ok(html.includes('2024–2025'));
  }
});

test('nested fields stay readable without creating invalid flat write targets', () => {
  const html = renderToStaticMarkup(<EditableCanvasProvider value={context}>
    <EditableField item={{ id: 'nested', meta: { name: 'Nested title' } }} field="meta.name" sectionKey="projects" label="Projects" />
  </EditableCanvasProvider>);
  assert.equal(html, 'Nested title');
});

test('skill formatting is rendered in the proposal and retained after acceptance', () => {
  const path = 'sections.skills[skill-1].name';
  const after = 'Proficient in <strong>HTML5</strong> and <strong>CSS3</strong>';
  const skill = { id: 'skill-1', name: 'Proficient in HTML5 and CSS3' };
  const render = (name: string, pendingByPath = {}) => renderToStaticMarkup(
    <EditableCanvasProvider value={{ ...context, pendingByPath }}>
      <ListSection title="Skills" sectionKey="skills" items={[{ ...skill, name }]} fieldMap={{ itemName: 'name' }} />
    </EditableCanvasProvider>,
  );
  const proposal = render(skill.name, { [path]: { before: skill.name, after, rationale: 'Emphasize technologies' } });
  const accepted = render(after);
  for (const html of [proposal, accepted]) {
    assert.ok(html.includes('<strong>HTML5</strong>'), 'formatting must render as markup');
    assert.ok(!html.includes('&lt;strong&gt;'), 'formatting tags must never be displayed literally');
  }
});
