import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Replay the real entry effect: selecting options must never open a paid room.
const ast = ts.createSourceFile(
  'InterviewRoom.tsx',
  readFileSync(new URL('./InterviewRoom.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let entryCode = '';
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'useEffect' &&
    node.arguments[0]?.getText(ast).includes('interviewApi.startStream')
  ) {
    entryCode = ts.transpileModule(`(${node.arguments[0].getText(ast)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function fixture(startRequested: boolean, routeId = 'new') {
  const calls: unknown[] = [];
  const launch = {
    roomId: 'same-room',
    cardId: 'card-1',
    brief: {
      role: 'Engineer',
      language: 'zh',
      difficulty: 'standard',
      durationMinutes: 20,
    },
    resumeContext: 'resume',
    agentSettings: { voice: 'ember', reportModel: 'chosen-model' },
  };
  const noop = () => {};
  const runtime = vm.createContext({
    routeId,
    startRequested,
    launch,
    beginRef: { current: false },
    selfStartedRef: { current: false },
    relaunchRef: { current: null },
    startedAtRef: { current: null },
    process: { env: {} },
    interviewApi: {
      startStream: async (input: unknown) => {
        calls.push(input);
        return { session_id: 'same-room', stage: 'introduction', message: '' };
      },
    },
    setScreen: noop,
    setRole: noop,
    setBusy: noop,
    setSessionId: noop,
    setStage: noop,
    setDeadline: noop,
    setRemainingSeconds: noop,
    setTurns: noop,
    setPrep: noop,
    clearLaunch: noop,
    rememberCardSession: noop,
    sessionDeadline: () => null,
    secondsUntil: () => 1200,
    appLifecycle: { aiInterviewStarted: noop },
    router: { replace: noop },
    Date,
  });
  assert.ok(entryCode, 'production entry effect must exist');
  return { calls, run: () => vm.runInContext(entryCode, runtime)() };
}
test('opening setup or selecting its options cannot start a session before confirmation', () => {
  const state = fixture(false);
  state.run();
  state.run();
  assert.equal(state.calls.length, 0);
});
test('confirmation submits selected voice/model once and preserves the originating room', async () => {
  const state = fixture(true);
  state.run();
  state.run();
  await new Promise(setImmediate);
  assert.equal(state.calls.length, 1);
  const input = state.calls[0] as {
    room_id: string;
    config: { voice: string; report_model: string };
  };
  assert.equal(input.room_id, 'same-room');
  assert.equal(input.config.voice, 'ember');
  assert.equal(input.config.report_model, 'chosen-model');
});
test('opening an existing session never creates another room', () => {
  const state = fixture(true, 'existing-room');
  state.run();
  assert.equal(state.calls.length, 0);
});
