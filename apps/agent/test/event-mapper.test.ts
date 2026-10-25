import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMessageChunk, AIMessage } from '@langchain/core/messages';
import type { AgentSseEvent } from '../../web/src/app/dashboard/edit/_components/ai/lib/services/types.js';
import type { AgentEvent } from '../src/contracts/events.js';
import { EventMapper, failureEvents } from '../src/engine/event-mapper.js';
import { ResumeAccumulator } from '../src/engine/resume-accumulator.js';
import { approvalEvent } from '../src/engine/approvals.js';
import { resume, improved } from './helpers.js';
function mapper() {
  return new EventMapper(new ResumeAccumulator(resume, 'cocreate'));
}
function event(
  type: string,
  name = '',
  data: Record<string, unknown> = {},
  rest = {},
) {
  return { event: type, name, run_id: 'example-event', data, ...rest };
}
// Compile-time comparison with the actual consuming frontend union.
function frontend(events: AgentEvent[]): AgentSseEvent[] {
  return events;
}

test('event mapper emits one run_started and model text, reasoning, usage with frontend fields', () => {
  const m = mapper();
  assert.equal(frontend(m.begin())[0].type, 'run_started');
  assert.deepEqual(m.begin(), []);
  const started = frontend(m.map(event('on_chat_model_start')));
  assert.equal(started[0].type, 'llm_started');
  assert.equal(started[0].payload?.requestId, 'example-event');
  const chunk = new AIMessageChunk({
    content: [
      { type: 'reasoning', reasoning: 'Consider evidence.' },
      { type: 'text', text: 'Hello.' },
    ],
  });
  const output = frontend(m.map(event('on_chat_model_stream', '', { chunk })));
  assert.deepEqual(
    output.map((item) => item.type),
    ['reasoning_chunk', 'message_chunk'],
  );
  assert.equal(output[0].content, 'Consider evidence.');
  const usage = frontend(
    m.map(
      event('on_chat_model_end', '', {
        output: new AIMessage({
          content: 'Done',
          usage_metadata: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
        }),
      }),
    ),
  );
  assert.equal(usage[0].type, 'llm_usage');
  assert.deepEqual(usage[0].payload?.usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });
  assert.equal(
    m.hasModelOutput(
      event('on_chat_model_stream', '', {
        chunk: new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              id: 'call',
              name: 'read_resume',
              args: '{}',
              index: 0,
              type: 'tool_call_chunk',
            },
          ],
        }),
      }),
    ),
    true,
  );
});

test('ordinary tool lifecycle uses bounded summaries and skill reads expose name/path only', () => {
  const m = mapper();
  const started = frontend(
    m.map(
      event('on_tool_start', 'read_file', {
        input: { file_path: '/skills/resume-analysis/SKILL.md' },
      }),
    ),
  );
  assert.equal(started[0].type, 'tool_started');
  const ended = frontend(
    m.map(
      event('on_tool_end', 'read_file', {
        output: { content: 'private source '.repeat(10000) },
      }),
    ),
  );
  assert.deepEqual(
    ended.map((item) => item.type),
    ['tool_result', 'tool_completed', 'skill_loaded'],
  );
  assert.equal(
    (ended[2].payload as { skill: string }).skill,
    'resume-analysis',
  );
  assert.ok(JSON.stringify(ended).length < 1000);
  const failure = frontend(
    m.map(
      event('on_tool_error', 'read_resume', {
        error: new Error('sensitive model response'),
      }),
    ),
  );
  assert.equal(failure[0].type, 'tool_result');
  assert.doesNotMatch(JSON.stringify(failure), /sensitive/);
});

test('write_todos maps first plan and subsequent updates with statuses unchanged', () => {
  const m = mapper();
  const todos = [{ content: 'Review source', status: 'in_progress' }];
  m.map(event('on_tool_start', 'write_todos', { input: { todos } }));
  const first = frontend(m.map(event('on_tool_end', 'write_todos')));
  assert.ok(first.some((item) => item.type === 'agent_plan'));
  assert.ok(
    first.some(
      (item) => item.type === 'plan_update' && item.payload?.todos === todos,
    ),
  );
  m.map(
    event('on_tool_start', 'write_todos', {
      input: { todos: [{ content: 'Review source', status: 'completed' }] },
    }),
  );
  const second = m.map(event('on_tool_end', 'write_todos'));
  assert.equal(second.filter((item) => item.type === 'agent_plan').length, 0);
  assert.equal(second.filter((item) => item.type === 'plan_update').length, 1);
});

test('mode activation and repeated skill reads share one notification per run', () => {
  const m = mapper();
  assert.equal(m.skillLoaded('resume-optimization').length, 1);
  for (const [skill, count] of [
    ['resume-optimization', 0],
    ['resume-analysis', 1],
    ['resume-analysis', 0],
  ] as const) {
    const events = m.map(
      event('on_tool_end', 'read_file', {
        input: { file_path: `/skills/${skill}/SKILL.md` },
      }),
    );
    assert.equal(
      events.filter((item) => item.type === 'skill_loaded').length,
      count,
    );
  }
  assert.deepEqual(m.skillLoaded('resume-analysis'), []);
  assert.equal(mapper().skillLoaded('resume-optimization').length, 1);
});

test('subagent lifecycle is visible while nested model and tool output stays out of the conversation', () => {
  const m = mapper();
  assert.equal(
    frontend(
      m.map(
        event('on_tool_start', 'task', {
          input: {
            subagent_type: 'general-purpose',
            description: 'Review evidence',
          },
        }),
      ),
    )[0].type,
    'subagent_started',
  );
  for (const type of [
    'on_chat_model_stream',
    'on_chat_model_start',
    'on_tool_start',
    'on_custom_event',
  ])
    assert.deepEqual(
      m.map(
        event(
          type,
          'read_resume',
          { chunk: { content: 'child private text' } },
          { parent_ids: ['example-event'] },
        ),
      ),
      [],
    );
  assert.equal(
    frontend(m.map(event('on_tool_end', 'task')))[0].type,
    'subagent_completed',
  );
  assert.deepEqual(
    m.map(
      event(
        'on_chat_model_stream',
        '',
        { chunk: { content: 'internal JSON' } },
        { tags: ['agent:insight'] },
      ),
    ),
    [],
  );
});

for (const name of [
  'ui_widget',
  'resume_analysis',
  'fit_report',
  'resume_change_notes',
  'resume_verification',
  'source_update',
] as const) {
  test(`custom ${name} has the frontend event payload envelope`, () => {
    const payload =
      name === 'ui_widget'
        ? { kind: 'suggestion_rail', props: { options: ['Review proposal'] } }
        : name === 'resume_verification'
          ? { status: 'flagged', suspectedFabrications: ['Example metric'] }
          : name === 'resume_change_notes'
            ? {
                notes: [
                  {
                    section: 'info',
                    itemId: 'info',
                    fieldKey: 'headline',
                    why: 'Clarify focus',
                  },
                ],
              }
            : name === 'source_update'
              ? { sources: [{ title: 'Example', url: 'https://example.com' }] }
              : { data: { score: 70 } };
    const mapped = frontend(
      mapper().map(event('on_custom_event', name, payload)),
    );
    assert.equal(mapped[0].type, name);
    assert.deepEqual(mapped[0].payload, payload);
  });
}
test('confirmed resume writes map to non-authoritative patches and accumulator emits a final snapshot', () => {
  const accumulator = new ResumeAccumulator(resume, 'cocreate');
  const m = new EventMapper(accumulator);
  const patch = frontend(
    m.map(
      event('on_custom_event', 'resume_file_saved', {
        path: '/workspace/resume.json',
        resume: improved,
      }),
    ),
  );
  assert.equal(patch[0].type, 'resume_patch');
  if (patch[0].type === 'resume_patch')
    assert.equal(patch[0].payload.mutation.authoritative, false);
  const final = frontend(accumulator.finalize());
  assert.equal(final[0].type, 'resume_update');
  if (final[0].type === 'resume_update')
    assert.equal(final[0].payload.mutation?.final, true);
});
test('interrupt mapping includes the identifiers the frontend really requires', () => {
  const pending = {
    requestId: 'r',
    interruptId: 'i',
    operationId: 'o',
    expectedCheckpointId: 'c',
    actions: [{ name: 'request_form', args: { formKind: 'job_info' } }],
  };
  const mapped = frontend([approvalEvent(pending)])[0];
  assert.equal(mapped.type, 'tool_approval_request');
  assert.deepEqual(mapped.payload, {
    ...pending,
    toolName: 'request_form',
    args: { formKind: 'job_info' },
    reason: 'Provide the requested input, or skip this step.',
  });
});
test('failures are fixed frontend codes followed by done, without raw provider details', () => {
  for (const status of [401, 429, 503]) {
    const mapped = frontend(
      failureEvents({ status, message: 'Private provider detail' }),
    );
    assert.deepEqual(
      mapped.map((item) => item.type),
      ['error', 'done'],
    );
    assert.doesNotMatch(JSON.stringify(mapped), /Private provider/);
  }
  assert.deepEqual(
    frontend(
      mapper().map(event('on_chain_error', '', { error: { status: 403 } })),
    ).map((item) => item.type),
    ['error', 'done'],
  );
});

test('child assessments and verification remain structured artifacts while child plans update its task card', () => {
  const m = mapper();
  m.map(
    event('on_tool_start', 'task', {
      input: { subagent_type: 'general-purpose' },
    }),
  );
  const context = { parent_ids: ['example-event'] };
  const result = m.map(
    event(
      'on_custom_event',
      'resume_verification',
      { suspectedFabrications: ['Example metric'] },
      context,
    ),
  );
  assert.equal(result[0].type, 'resume_verification');
  m.map(
    event(
      'on_tool_start',
      'write_todos',
      {
        input: { todos: [{ content: 'Check evidence', status: 'completed' }] },
      },
      context,
    ),
  );
  assert.ok(
    m
      .map(event('on_tool_end', 'write_todos', {}, context))
      .some((item) => item.type === 'plan_update'),
  );
});
