import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { resumeSchema } from '@magic-resume-kit/resume-schema';
import { fixture, frames, improved, resume, waitFor } from './helpers.js';

const call = (name: string, args: unknown) => ({ calls: [{ name, args }] });
for (const storage of ['memory', 'sqlite'] as const) {
  test(`${storage} 1: checkpoint history appends only the newest user message`, async (t) => {
    const f = await fixture(t, storage, [
      { text: 'First answer' },
      { text: 'Second answer' },
    ]);
    await f.chat(
      f.body({
        sessionId: 'conversation',
        turnId: 'turn-1',
        messages: [{ role: 'user', content: 'First question' }],
      }),
    );
    await f.chat(
      f.body({
        sessionId: 'conversation',
        turnId: 'turn-2',
        messages: [
          { role: 'user', content: 'Wrong browser history' },
          { role: 'assistant', content: 'Wrong answer' },
          { role: 'user', content: 'Second question' },
        ],
      }),
    );
    const sent = JSON.stringify(f.fake.requests[1].messages);
    assert.match(sent, /First question/);
    assert.match(sent, /First answer/);
    assert.match(sent, /Second question/);
    assert.doesNotMatch(sent, /Wrong browser/);
    assert.equal(
      f.fake.requests[1].messages.filter(
        (message) => message.content === 'First question',
      ).length,
      1,
    );
  });
  test(`${storage} 2: real optimization tools publish plans, reasons, patches and one final valid proposal`, async (t) => {
    const f = await fixture(t, storage, [
      call('read_file', { file_path: '/skills/resume-optimization/SKILL.md' }),
      call('read_resume', {}),
      call('write_todos', {
        todos: [{ content: 'Improve headline', status: 'in_progress' }],
      }),
      call('explain_changes', {
        notes: [
          {
            section: 'info',
            itemId: 'info',
            fieldKey: 'headline',
            why: 'Name the demonstrated engineering focus.',
          },
        ],
      }),
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: JSON.stringify(improved),
      }),
      call('write_todos', {
        todos: [{ content: 'Improve headline', status: 'completed' }],
      }),
      { text: 'The proposal is ready for review.' },
    ]);
    const events = await f.chat(
      f.body({ sessionId: 'optimize', mode: 'optimize', turnId: 'turn-1' }),
    );
    for (const type of [
      'agent_plan',
      'plan_update',
      'resume_change_notes',
      'resume_patch',
      'resume_update',
      'skill_loaded',
    ])
      assert.ok(
        events.some((event) => event.type === type),
        type,
      );
    const updates = events.filter((event) => event.type === 'resume_update');
    assert.equal(updates.length, 1);
    assert.equal(
      resumeSchema.safeParse(updates[0].payload.resume).success,
      true,
    );
    assert.equal(
      updates[0].payload.resume.info &&
        (updates[0].payload.resume.info as { headline: string }).headline,
      improved.info.headline,
    );
  });
  test(`${storage} 3: malformed JSON and field errors are refused before a corrected write`, async (t) => {
    const f = await fixture(t, storage, [
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: '{broken',
      }),
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: JSON.stringify({ ...resume, info: { fullName: 123 } }),
      }),
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: JSON.stringify(improved),
      }),
      { text: 'Ready.' },
    ]);
    const events = await f.chat();
    assert.match(
      JSON.stringify(f.fake.requests[1].messages),
      /valid JSON|write rejected/,
    );
    assert.match(JSON.stringify(f.fake.requests[2].messages), /info/);
    assert.equal(
      events.filter((event) => event.type === 'resume_patch').length,
      1,
    );
    assert.equal(
      events.filter((event) => event.type === 'resume_update').length,
      1,
    );
  });
  test(`${storage} 4: native input interrupt survives server recreation and approvals are idempotent`, async (t) => {
    const f = await fixture(t, storage, [
      call('request_form', {
        formKind: 'job_info',
        message: 'Provide the target JD.',
      }),
      { text: 'I received the target job.' },
    ]);
    const events = await f.chat(
      f.body({ sessionId: 'approval', turnId: 'turn-1' }),
    );
    const paused = events.find(
      (event) => event.type === 'tool_approval_request',
    );
    assert.ok(paused);
    const state = await f.state('approval');
    assert.equal(state.state, 'awaiting_input');
    assert.deepEqual(state.pendingApproval.actions, paused.payload.actions);
    if (storage === 'sqlite') {
      const bytes = await readFile(join(f.dataDir, 'checkpoints.sqlite'));
      assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    }
    await f.restart();
    assert.equal(
      (await f.state('approval')).pendingApproval.operationId,
      paused.payload.operationId,
    );
    const base = {
      ...f.body(),
      ...state.pendingApproval,
      sessionId: 'approval',
      decisions: [
        {
          type: 'edit',
          editedAction: {
            name: 'request_form',
            args: {
              ...paused.payload.actions[0].args,
              values: { jd: 'Build accessible interfaces.' },
            },
          },
        },
      ],
    };
    const continued = await f.post('/api/chat/approve', base);
    assert.equal(continued.status, 200, await continued.clone().text());
    frames(await continued.text());
    assert.match(
      JSON.stringify(f.fake.requests.at(-1)?.messages),
      /Build accessible interfaces/,
    );
    const duplicate = await f.post('/api/chat/approve', base);
    assert.equal(duplicate.status, 409);
    assert.equal(
      (await duplicate.json()).subCode,
      'approval_already_processed',
    );
    const conflict = await f.post('/api/chat/approve', {
      ...base,
      decisions: [{ type: 'reject' }],
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).subCode, 'approval_decision_conflict');
    f.fake.scripts.push(call('request_form', { formKind: 'target_language' }), {
      text: 'Skipped; no translation was made.',
    });
    await f.chat(f.body({ sessionId: 'reject' }));
    const rejected = await f.state('reject');
    const response = await f.post('/api/chat/approve', {
      ...f.body(),
      ...rejected.pendingApproval,
      sessionId: 'reject',
      decisions: [{ type: 'reject', message: 'Skip this step.' }],
    });
    assert.equal(response.status, 200);
    assert.ok(
      frames(await response.text()).every(
        (event) => !['resume_patch', 'resume_update'].includes(event.type),
      ),
    );
    if (storage === 'sqlite') {
      const bytes = await readFile(join(f.dataDir, 'checkpoints.sqlite'));
      assert.equal(bytes.includes(Buffer.from('example-test-key')), false);
    }
  });
  test(`${storage} 5: plan refuses writes, ask strips both submitted and checkpointed resume data`, async (t) => {
    const f = await fixture(t, storage, [
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: JSON.stringify(improved),
      }),
      { text: 'Here is a plan.' },
      call('read_resume', {}),
      { text: 'Resume read.' },
      { text: 'General answer.' },
    ]);
    const events = await f.chat(f.body({ agentMode: 'plan' }));
    assert.ok(
      events.every(
        (event) => !['resume_patch', 'resume_update'].includes(event.type),
      ),
    );
    assert.match(
      JSON.stringify(f.fake.requests[1].messages),
      /reading and planning only/,
    );
    await f.chat(f.body({ sessionId: 'switch' }));
    await f.chat(
      f.body({
        sessionId: 'switch',
        agentMode: 'ask',
        resumeId: 'private-example-resume',
        currentResume: { secret: 'private-marker' },
      }),
    );
    const sent = JSON.stringify(f.fake.requests.at(-1));
    assert.doesNotMatch(
      sent,
      /Alex Chen|Example Labs|private-marker|private-example-resume/,
    );
    const tools = f.fake.requests
      .at(-1)
      ?.tools?.map((tool) => tool.function.name);
    assert.ok(!tools?.includes('task'));
    assert.ok(!tools?.includes('read_resume'));
  });
  test(`${storage} 6: loading the analysis skill blocks write_file`, async (t) => {
    const f = await fixture(t, storage, [
      call('read_file', { file_path: '/skills/resume-analysis/SKILL.md' }),
      call('write_file', {
        file_path: '/workspace/resume.json',
        content: JSON.stringify(improved),
      }),
      { text: 'Analysis only.' },
    ]);
    const events = await f.chat();
    assert.ok(
      events.every(
        (event) => !['resume_patch', 'resume_update'].includes(event.type),
      ),
    );
    assert.match(
      JSON.stringify(f.fake.requests.at(-1)?.messages),
      /does not permit write_file/,
    );
  });
  test(`${storage} 7: exhausted model and tool budgets produce a normal final response`, async (t) => {
    const f = await fixture(
      t,
      storage,
      [
        call('read_resume', {}),
        { text: 'Budget reached; remaining work is unfinished.' },
      ],
      { AGENT_MAX_MODEL_CALLS: '2', AGENT_MAX_TOOL_CALLS: '1' },
    );
    const events = await f.chat();
    assert.ok(events.some((event) => event.type === 'message_chunk'));
    assert.equal(f.fake.requests[1].tool_choice, 'none');
    assert.equal(f.fake.requests[1].tools, undefined);
    assert.match(
      JSON.stringify(f.fake.requests[1].messages),
      /budget is exhausted/,
    );
  });
  test(`${storage} 8: cancelling an in-flight tool recovers without dangling tool-call errors`, async (t) => {
    const f = await fixture(t, storage, [
      call('analyze_resume', {}),
      { hang: true },
    ]);
    const controller = new AbortController();
    const response = await f.post(
      '/api/chat',
      f.body({ sessionId: 'cancelled-tool' }),
      controller.signal,
    );
    const reader = response.body!.getReader();
    await waitFor(() => f.fake.requests.length >= 2);
    controller.abort();
    await reader.cancel().catch(() => {});
    await waitFor(() => f.fake.state.aborted >= 1);
    f.fake.scripts.push({ text: 'Recovered.' });
    let next: Response | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      next = await f.post(
        '/api/chat',
        f.body({
          sessionId: 'cancelled-tool',
          messages: [
            { role: 'user', content: 'Continue from the confirmed results.' },
          ],
        }),
      );
      if (next.status !== 409) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(
      next?.status,
      200,
      next ? await next.clone().text() : 'no response',
    );
    frames(await next!.text());
    assert.equal(f.fake.state.invalidHistory, 0);
  });
  test(`${storage} 9: forking the second turn retains only the first turn's history`, async (t) => {
    const f = await fixture(t, storage, [
      { text: 'First answer' },
      { text: 'Original second answer' },
      { text: 'Regenerated second answer' },
    ]);
    await f.chat(
      f.body({
        sessionId: 'source',
        turnId: 'one',
        messages: [{ role: 'user', content: 'Question one' }],
      }),
    );
    await f.chat(
      f.body({
        sessionId: 'source',
        turnId: 'two',
        messages: [{ role: 'user', content: 'Original question two' }],
      }),
    );
    const source = await f.state('source');
    const fork = await f.post('/api/chat/session/fork', {
      sourceSessionId: 'source',
      sourceTurnId: 'two',
      expectedCheckpointId: source.checkpointId,
      newSessionId: 'fork',
    });
    assert.equal(fork.status, 200, await fork.clone().text());
    await f.chat(
      f.body({
        sessionId: 'fork',
        turnId: 'two-new',
        messages: [{ role: 'user', content: 'Revised question two' }],
      }),
    );
    const sent = JSON.stringify(f.fake.requests.at(-1)?.messages);
    assert.match(sent, /Question one/);
    assert.match(sent, /First answer/);
    assert.doesNotMatch(sent, /Original question two|Original second answer/);
    const stale = await f.post('/api/chat/session/fork', {
      sourceSessionId: 'source',
      sourceTurnId: 'two',
      expectedCheckpointId: 'outdated',
      newSessionId: 'stale',
    });
    assert.equal(stale.status, 409);
  });
  test(`${storage} 10: client disconnect cancels the upstream stream`, async (t) => {
    const f = await fixture(t, storage, [
      { text: 'First output', hang: true, intervalMs: 30 },
    ]);
    const response = await f.post(
      '/api/chat',
      f.body({ sessionId: 'disconnect' }),
    );
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await waitFor(() => f.fake.state.aborted === 1);
  });
}
