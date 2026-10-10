import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { diffResumeToChanges } from '../src/app/dashboard/edit/_components/ai/lib/diffResume';
import { applyChangeToSections } from '../src/app/dashboard/edit/_components/ai/lib/changeModel';
import {
  mergeInterviewTurns,
  upsertVoiceTurn,
} from '../src/app/dashboard/interview/_components/mergeTurns';
import type { VoiceTurn } from '../src/app/dashboard/interview/_components/useVoiceInterview';

// Synthetic fixtures only. Replay the production callbacks so routing and
// persistence regressions cannot pass by testing an independent parser.
let failures = 0;
let checks = 0;
async function check(name: string, run: () => unknown) {
  checks++;
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}`, error);
  }
}
const path = '../src/app/dashboard/interview/_components/useVoiceInterview.ts';
const ast = ts.createSourceFile(
  path,
  readFileSync(new URL(path, import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const callbacks = new Map<string, string>();
function visit(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(ast) === 'useCallback'
  ) {
    callbacks.set(
      node.name.text,
      ts.transpileModule(`(${node.initializer.arguments[0].getText(ast)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
    );
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function bind(name: string, runtime: vm.Context) {
  assert.ok(callbacks.has(name), `production callback ${name} must exist`);
  return vm.runInContext(callbacks.get(name)!, runtime);
}
function fixture() {
  let state = {
    turns: [] as VoiceTurn[],
    liveReply: '',
    liveTranscript: '',
    phase: 'listening',
  };
  const reports: unknown[][] = [];
  const sent: unknown[] = [];
  const runtime = vm.createContext({
    upsertVoiceTurn,
    crypto: { randomUUID },
    Date,
    lyraMessagesRef: { current: new Map() },
    transcriptClockRef: { current: 100 },
    transcriptTimesRef: { current: new Map() },
    voiceRef: {
      current: {
        connectionId: 'connection',
        dc: {
          readyState: 'open',
          send: (data: string) => sent.push(JSON.parse(data)),
        },
      },
    },
    roomRef: { current: null },
    primerRef: { current: '' },
    performance: { now: () => 1 },
    lyraTextOf: (message: { parts: string[] }) => message.parts.join('').trim(),
    setState: (update: (value: typeof state) => typeof state) => {
      state = update(state);
    },
    recordTranscript: (...args: unknown[]) => reports.push(args),
    console: { debug() {}, warn() {} },
  });
  runtime.transcriptAt = bind('transcriptAt', runtime);
  runtime.settleLyraTurn = bind('settleLyraTurn', runtime);
  const lyra = bind('handleLyraEvent', runtime);
  const vega = bind('handleVegaEvent', runtime);
  // relayMessage is deliberately decoded here; the sender's id must be the
  // same identity later used for its transcript and upstream echo.
  runtime.relayMessage = (text: string, id: string) =>
    JSON.stringify({ text, id });
  const sendText = bind('sendText', runtime);
  const emit = (delta: unknown) =>
    lyra(JSON.stringify({ type: 'chat_message_delta', payload: { delta } }));
  const start = (seq: number, role: string, text = '', id?: string) =>
    emit({
      c: seq,
      v: { message: { id, author: { role }, content: { parts: [{ text }] } } },
    });
  const finish = (seq: number, text: string, op = 'append') =>
    emit({
      c: seq,
      v: [
        { p: '/message/content/parts/0/text', o: op, v: text },
        { p: '/message/status', o: 'replace', v: 'finished_successfully' },
      ],
    });
  return {
    runtime,
    reports,
    sent,
    emit,
    start,
    finish,
    sendText,
    vega,
    state: () => state,
  };
}

async function main() {
  const current = {
    experience: [{ id: 'saved-id', visible: true, summary: '<p>Node.js</p>' }],
  };
  await check(
    'bold-only edits enter review and acceptance keeps the HTML and original id',
    () => {
      const proposed = {
        experience: [
          {
            ...current.experience[0],
            summary: '<p><strong>Node.js</strong></p>',
          },
        ],
      };
      const changes = diffResumeToChanges(current, proposed, 'optimize');
      assert.equal(changes.length, 1);
      assert.equal(changes[0].target.kind, 'html');
      assert.equal(changes[0].before, '<p>Node.js</p>');
      const accepted = applyChangeToSections(current, changes[0]);
      assert.equal(accepted.applied, true);
      assert.equal(
        accepted.sections.experience[0].summary,
        proposed.experience[0].summary,
      );
      assert.equal(accepted.sections.experience[0].id, 'saved-id');
      assert.equal(
        diffResumeToChanges(proposed, proposed, 'optimize').length,
        0,
      );
      assert.equal(
        diffResumeToChanges(current, proposed, 'optimize', undefined, {
          path: 'experience/saved-id/summary',
          selectionText: 'Node.js',
        }).length,
        1,
      );
    },
  );
  await check(
    'unknown item identities stay rejected instead of changing unrelated resume entries',
    () => {
      const diagnostics = { unmatchedItems: 0 };
      assert.equal(
        diffResumeToChanges(
          current,
          {
            experience: [
              {
                ...current.experience[0],
                id: 'invented-id',
                summary: 'changed',
              },
            ],
          },
          'optimize',
          undefined,
          undefined,
          diagnostics,
        ).length,
        0,
      );
      assert.equal(diagnostics.unmatchedItems, 1);
    },
  );
  await check('typed and voiced turns merge in chronological order', () => {
    const turns = mergeInterviewTurns(
      [{ role: 'candidate', text: 'answer', at: 200 }],
      [{ role: 'interviewer', text: 'question', at: 100 }],
    );
    assert.deepEqual(
      turns.map((t) => t.text),
      ['question', 'answer'],
    );
  });
  await check(
    'late final updates replace their own segment and preserve genuine repeated speech',
    () => {
      const turns: VoiceTurn[] = [
        { role: 'candidate', text: 'draft', segmentId: 'c1', at: 100 },
        { role: 'interviewer', text: 'question', segmentId: 'i1', at: 200 },
      ];
      const updated = upsertVoiceTurn(turns, {
        role: 'candidate',
        text: 'final',
        segmentId: 'c1',
        at: 300,
      });
      assert.deepEqual(
        updated.map((t) => t.text),
        ['final', 'question'],
      );
      assert.equal(updated[0].at, 100);
      assert.equal(
        upsertVoiceTurn(updated, {
          role: 'candidate',
          text: 'final',
          segmentId: 'c2',
          at: 400,
        }).length,
        3,
      );
    },
  );
  await check(
    'interleaved Lyra patches route by cursor and sort by first speech event',
    () => {
      const f = fixture();
      f.start(1, 'assistant');
      f.start(2, 'user');
      f.finish(2, 'answer');
      f.finish(1, 'question');
      assert.deepEqual(
        f.state().turns.map((t) => [t.role, t.text]),
        [
          ['interviewer', 'question'],
          ['candidate', 'answer'],
        ],
      );
      assert.equal(f.reports.length, 2);
      assert.ok(Number(f.reports[1][3]) < Number(f.reports[0][3]));
    },
  );
  await check(
    'candidate greetings before the opening are retained and primer echoes are excluded',
    () => {
      const f = fixture();
      f.start(1, 'user');
      f.finish(1, 'hello interviewer');
      assert.equal(f.state().turns[0].role, 'candidate');
      f.runtime.primerRef.current = 'private interviewer instructions';
      f.start(2, 'user');
      f.finish(2, 'private interviewer instructions');
      assert.equal(f.state().turns.length, 1);
      assert.equal(f.reports.length, 1);
    },
  );
  await check(
    'replacement patches replace text; unknown and ambiguous cursors cannot corrupt another speaker',
    () => {
      const f = fixture();
      f.start(1, 'assistant', 'draft');
      f.start(2, 'user', 'answer');
      f.finish(99, 'unknown');
      f.emit({
        p: '/message/content/parts/0/text',
        o: 'append',
        v: 'ambiguous',
      });
      f.finish(1, 'final question', 'replace');
      f.finish(2, '', 'append');
      assert.deepEqual(
        f.state().turns.map((t) => t.text),
        ['final question', 'answer'],
      );
      f.finish(1, 'duplicate');
      assert.equal(f.state().turns.length, 2);
    },
  );
  await check(
    'different Lyra message ids with identical words are separate utterances',
    () => {
      const f = fixture();
      f.start(1, 'assistant');
      f.finish(1, 'repeat');
      f.start(2, 'user');
      f.finish(2, 'answer');
      f.start(3, 'assistant');
      f.finish(3, 'repeat');
      assert.equal(f.state().turns.length, 3);
    },
  );
  await check(
    'upstream typed input is displayed, saved and reconciled with its echo by message id',
    async () => {
      const f = fixture();
      assert.equal(await f.sendText('typed answer'), true);
      assert.equal(f.reports.length, 1);
      assert.equal(f.reports[0][1], 'user');
      assert.equal(f.state().turns[0].text, 'typed answer');
      const id = (f.sent[0] as { id: string }).id;
      assert.equal(f.reports[0][0], `connection:${id}`);
      f.start(1, 'user', '', id);
      f.finish(1, 'typed answer');
      assert.equal(f.state().turns.length, 1);
      f.runtime.voiceRef.current.dc.readyState = 'closed';
      assert.equal(await f.sendText('not sent'), false);
      assert.equal(f.state().turns.length, 1);
    },
  );
  await check(
    'Vega repeats remain separate, and delayed final text keeps its first event time',
    () => {
      const f = fixture();
      f.vega(
        JSON.stringify({
          type: 'turn.delta',
          turn: { id: 'i1' },
          delta: 'question',
        }),
      );
      f.vega(
        JSON.stringify({
          type: 'turn.done',
          turn: { id: 'u1', role: 'user', transcript: 'answer' },
        }),
      );
      f.vega(
        JSON.stringify({
          type: 'turn.done',
          turn: { id: 'i1', role: 'assistant', transcript: 'question' },
        }),
      );
      f.vega(
        JSON.stringify({
          type: 'turn.done',
          turn: { id: 'i2', role: 'assistant', transcript: 'question' },
        }),
      );
      assert.deepEqual(
        f.state().turns.map((t) => t.text),
        ['question', 'answer', 'question'],
      );
    },
  );
  await check(
    'transcript writes and retries are serialized and idempotent',
    async () => {
      let active = 0;
      let maxActive = 0;
      const attempts: string[] = [];
      const runtime = vm.createContext({
        sessionId: 'session',
        transcriptWritesRef: { current: new Map() },
        transcriptQueueRef: { current: Promise.resolve() },
        interviewApi: {
          recordVoiceTranscript: async (
            _session: string,
            payload: { transcript_id: string },
          ) => {
            active++;
            maxActive = Math.max(active, maxActive);
            attempts.push(payload.transcript_id);
            await Promise.resolve();
            active--;
            if (attempts.length <= 2) throw new Error('temporary failure');
          },
        },
        console: { warn() {} },
      });
      const record = bind('recordTranscript', runtime);
      record('c1', 'assistant', 'question', 100);
      record('c2', 'user', 'answer', 200);
      record('c1', 'assistant', 'question', 100);
      await bind('flushTranscripts', runtime)();
      assert.equal(maxActive, 1);
      assert.deepEqual(attempts, ['c1', 'c2', 'c1', 'c2']);
      assert.equal(runtime.transcriptWritesRef.current.size, 0);
    },
  );
  console.log(
    `${checks - failures}/${checks} resume and voice regressions passed.`,
  );
  process.exitCode = failures ? 1 : 0;
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
