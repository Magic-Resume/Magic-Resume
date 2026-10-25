import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadResume } from '../src/harness/tools/read-resume.js';
import { resumeMarkdown } from '../src/harness/tools/reader.js';
import {
  createAnalyzeResume,
  CATEGORIES,
} from '../src/harness/tools/analyze-resume.js';
import {
  createEvaluateFit,
  computeFit,
} from '../src/harness/tools/evaluate-fit.js';
import { createExplainChanges } from '../src/harness/tools/explain-changes.js';
import { createPushUi } from '../src/harness/tools/push-ui.js';
import { createRequestForm } from '../src/harness/tools/request-form.js';
import { createAskChoice } from '../src/harness/tools/ask-choice.js';
import {
  InsightError,
  type InsightInvoker,
} from '../src/harness/tools/insight-model.js';
import { captureCustom } from './middleware-helpers.js';
import { fixture, resume } from './helpers.js';

test('read_resume returns exact current JSON and a readable view that keeps custom sections', async () => {
  const source = {
    ...resume,
    sections: {
      ...resume.sections,
      custom_work: [
        {
          id: 'custom-example',
          visible: true,
          title: 'Example contribution',
          summary: '<p>Accessible delivery.</p>',
        },
      ],
      hidden: [{ id: 'hidden', visible: false, summary: 'Hidden marker' }],
    },
  };
  const result = JSON.parse(
    String(await createReadResume(async () => source).invoke({})),
  );
  assert.deepEqual(result.resume, source);
  assert.equal(result.path, '/workspace/resume.json');
  assert.match(result.markdown, /Example contribution/);
  assert.doesNotMatch(result.markdown, /<p>|Hidden marker/);
  assert.ok(resumeMarkdown(resume).includes('Alex Chen'));
});
test('analyze_resume performs three distinct assessments and rejects invented evidence references', async () => {
  const prompts: string[] = [];
  const invoke: InsightInvoker = async (prompt, schema) => {
    prompts.push(prompt);
    return schema.parse({
      score: 80,
      categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 80])),
      strengths: ['Clear evidence'],
      weaknesses: ['Scope needs detail'],
      suggestions: ['Clarify ownership'],
      issues: [
        {
          problem: 'Scope',
          suggestion: 'Explain responsibility',
          severity: 'high',
          missingEvidence: ['Ownership'],
          evidence: [
            {
              sectionKey: 'experience',
              itemId: 'example-role',
              fieldKey: 'summary',
              quote: 'Built accessible interfaces.',
            },
            {
              sectionKey: 'experience',
              itemId: 'invented-id',
              fieldKey: 'summary',
              quote: 'Invented claim',
            },
          ],
        },
      ],
    });
  };
  const { result, events } = await captureCustom(() =>
    createAnalyzeResume(async () => resume, invoke).invoke({}),
  );
  assert.equal(prompts.length, 3);
  assert.equal(new Set(prompts).size, 3);
  assert.match(String(result), /80/);
  const analysis = (
    events.find((event) => event.name === 'resume_analysis')?.data as {
      data: {
        overall_score: number;
        improvement_actions: { evidence: unknown[] }[];
      };
    }
  ).data;
  assert.equal(analysis.overall_score, 80);
  assert.ok(
    analysis.improvement_actions.every(
      (action) => action.evidence.length === 1,
    ),
  );
  const bad: InsightInvoker = async () => {
    throw new InsightError('Assessment invalid');
  };
  assert.match(
    String(await createAnalyzeResume(async () => resume, bad).invoke({})),
    /invalid/,
  );
});
test('evaluate_fit extracts requirements then scores each against actual evidence', async () => {
  const prompts: string[] = [];
  const invoke: InsightInvoker = async (prompt, schema) => {
    prompts.push(prompt);
    return schema.parse(
      prompts.length === 1
        ? {
            requirements: [
              {
                requirement: 'Accessible interfaces',
                keywords: ['accessible', 'TypeScript'],
                dimension: 'technical',
              },
              {
                requirement: 'Team scope',
                keywords: [],
                dimension: 'experience',
              },
              {
                requirement: 'Communication',
                keywords: [],
                dimension: 'behavioral',
              },
              {
                requirement: 'Engineering focus',
                keywords: ['Engineer'],
                dimension: 'career',
              },
            ],
            location: '',
          }
        : {
            assessments: [0, 1, 2, 3].map((requirementIndex) => ({
              requirementIndex,
              score: 80,
              evidence: ['Built accessible interfaces.'],
              gap: 'Clarify scope',
            })),
            location_pass: true,
          },
    );
  };
  const { events } = await captureCustom(() =>
    createEvaluateFit(async () => resume, invoke).invoke({
      jd: 'Example role: accessible engineering work.',
    }),
  );
  assert.equal(prompts.length, 2);
  const report = (
    events.find((event) => event.name === 'fit_report')?.data as {
      data: {
        overall: number;
        matched_keywords: string[];
        missing_keywords: string[];
      };
    }
  ).data;
  assert.equal(report.overall, 80);
  assert.ok(report.matched_keywords.includes('accessible'));
  assert.ok(report.missing_keywords.includes('TypeScript'));
  const unmatched = computeFit(
    {
      requirements: [
        {
          requirement: 'Missing skill',
          keywords: ['fictional-skill'],
          dimension: 'technical',
        },
      ],
      location: 'Example City',
    },
    {
      assessments: [
        {
          requirementIndex: 0,
          score: 100,
          evidence: ['Not present in this resume'],
          gap: 'Needs evidence',
        },
      ],
      location_pass: false,
    },
    resume,
  );
  assert.equal(unmatched.overall, 0);
  assert.equal(unmatched.band, 'poor');
});
test('explain_changes emits field-specific notes without rewriting the document', async () => {
  const input = {
    notes: [
      {
        section: 'experience',
        itemId: 'example-role',
        fieldKey: 'summary',
        why: 'Make the supported action easier to scan.',
      },
    ],
  };
  const captured = await captureCustom(() =>
    createExplainChanges().invoke(input),
  );
  assert.deepEqual(
    captured.events.find((event) => event.name === 'resume_change_notes')?.data,
    input,
  );
});
test('push_ui validates kinds and complete merged props before publishing cards', async () => {
  const tool = createPushUi();
  const captured = await captureCustom(async () => {
    assert.match(
      String(await tool.invoke({ kind: 'unknown', props: {} })),
      /unavailable/,
    );
    assert.match(
      String(
        await tool.invoke({ kind: 'suggestion_rail', props: { options: [] } }),
      ),
      /rejected/,
    );
    assert.match(
      String(
        await tool.invoke({
          kind: 'request_form',
          props: { formKind: 'job_info' },
        }),
      ),
      /unavailable/,
    );
    await tool.invoke({
      kind: 'suggestion_rail',
      widgetId: 'example-card',
      props: { options: ['Review draft'] },
    });
    await tool.invoke({
      kind: 'suggestion_rail',
      widgetId: 'example-card',
      merge: true,
      props: { message: 'Next step' },
    });
    assert.match(
      String(
        await tool.invoke({
          kind: 'suggestion_rail',
          widgetId: 'example-card',
          merge: true,
          props: { options: [] },
        }),
      ),
      /rejected/,
    );
  });
  assert.equal(
    captured.events.filter((event) => event.name === 'ui_widget').length,
    2,
  );
  const last = captured.events
    .filter((event) => event.name === 'ui_widget')
    .at(-1)?.data as { props: { options: string[] } };
  assert.deepEqual(last.props.options, ['Review draft']);
});
test('request_form and ask_choice return user submissions and never imply missing answers exist', async () => {
  const form = createRequestForm();
  assert.match(
    String(
      await form.invoke({
        formKind: 'job_info',
        values: { jd: 'Example role' },
      }),
    ),
    /Example role/,
  );
  assert.match(
    String(await form.invoke({ formKind: 'job_info' })),
    /No submitted/,
  );
  const choice = createAskChoice();
  assert.match(
    String(
      await choice.invoke({
        message: 'Which path?',
        options: ['Improve', 'Create'],
        values: { choice: 'Improve' },
      }),
    ),
    /Improve/,
  );
  assert.match(
    String(
      await choice.invoke({
        message: 'Which path?',
        options: ['Improve', 'Create'],
      }),
    ),
    /No user choice/,
  );
  await assert.rejects(form.invoke({ formKind: 'invalid' } as never));
});
test('analysis and fit tools use the real nested model protocol without leaking internal JSON into chat', async (t) => {
  const persona = {
    score: 70,
    categories_scores: Object.fromEntries(CATEGORIES.map((key) => [key, 70])),
    strengths: ['Readable'],
    weaknesses: ['Unclear scope'],
    suggestions: ['Clarify scope'],
    issues: [],
  };
  const f = await fixture(t, 'sqlite', [
    { calls: [{ name: 'analyze_resume', args: {} }] },
    ...[0, 1, 2].map(() => ({ text: JSON.stringify(persona) })),
    { text: 'The report is ready.' },
  ]);
  const events = await f.chat();
  assert.equal(f.fake.requests.length, 5);
  assert.ok(events.some((event) => event.type === 'resume_analysis'));
  const visible = events
    .filter((event) => event.type === 'message_chunk')
    .map((event) => ('content' in event ? event.content : ''))
    .join('');
  assert.equal(visible, 'The report is ready.');
  for (const request of f.fake.requests)
    assert.doesNotMatch(JSON.stringify(request), /example-test-key/);
});
