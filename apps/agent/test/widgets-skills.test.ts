import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import {
  WIDGET_SCHEMAS,
  validateWidget,
} from '../src/harness/tools/widgets.js';
import {
  loadSkillCatalog,
  MODE_SKILL,
  parseSkill,
} from '../src/harness/skills/catalog.js';
import { readSettings } from '../src/config.js';

test('the backend Zod registry has exactly the frontend card names', async () => {
  const path = fileURLToPath(
    new URL(
      '../../web/src/app/dashboard/edit/_components/ai/widgets/registry.ts',
      import.meta.url,
    ),
  );
  const source = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let names: string[] | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'WIDGETS' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    )
      names = node.initializer.properties
        .map((property) =>
          property.name!.getText(source).replace(/^['"]|['"]$/g, ''),
        )
        .sort();
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(names);
  assert.deepEqual(Object.keys(WIDGET_SCHEMAS).sort(), names);
  assert.equal(
    validateWidget('suggestion_rail', { options: [] })?.success,
    false,
  );
  assert.equal(
    validateWidget('suggestion_rail', { options: ['Review'] })?.success,
    true,
  );
});
test('workflow and import skills have valid metadata, explicit permissions and complete procedure sections', async () => {
  const catalog = loadSkillCatalog(readSettings({}).skillsDir);
  assert.deepEqual(
    [...catalog.keys()].sort(),
    [...Object.values(MODE_SKILL), 'resume-parse'].sort(),
  );
  for (const [name, meta] of catalog) {
    assert.ok(meta.description);
    assert.equal(meta.allowedTools.length === 0, name === 'resume-parse');
    const source = await readFile(
      `${readSettings({}).skillsDir}/${name}/SKILL.md`,
      'utf8',
    );
    for (const title of [
      'Goal',
      'Use and exclusions',
      'Preconditions',
      'Procedure',
      'Completion',
      'Failure fallback',
      'Output constraints',
    ])
      assert.ok(source.includes(`## ${title}`), `${name}: ${title}`);
  }
  for (const name of ['resume-analysis', 'job-fit'])
    for (const tool of ['write_file', 'edit_file', 'explain_changes', 'task'])
      assert.ok(!catalog.get(name)?.allowedTools.includes(tool));
  assert.deepEqual(
    parseSkill(
      '---\nname: example\ndescription: >-\n  A useful\n  description\nallowed-tools: [read_resume, push_ui]\n---\nBody',
    ).allowedTools,
    ['read_resume', 'push_ui'],
  );
});
