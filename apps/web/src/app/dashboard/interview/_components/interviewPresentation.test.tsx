import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import ts from 'typescript';
import enCopy from '@/locales/en/translation.json';
import zhCopy from '@/locales/zh/translation.json';
import { fromAxiosError } from '@/lib/errors/normalize';
import InterviewVoiceAgent from './InterviewVoiceAgent';
import InterviewStatePanel from './InterviewStatePanel';
import {
  interviewAudioLevel,
  interviewIssueOf,
  interviewVoiceStatus,
} from './interviewPresentation';

const i18n = createInstance();
before(async () => {
  await i18n.init({
    lng: 'zh',
    resources: { zh: { translation: zhCopy }, en: { translation: enCopy } },
    interpolation: { escapeValue: false },
  });
});
const render = (child: React.ReactNode) =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n }, child));
const responseError = (
  status: number,
  errorCode?: string,
  message = 'Not found',
) => ({
  response: { status, data: { errorCode, message, requestId: 'request-42' } },
});

test('candidate input stops while muted; interviewer output remains live', () => {
  const levels = { input: 0.8, output: 0.4 };
  assert.equal(interviewAudioLevel('listening', levels, false), 0.52);
  assert.equal(interviewAudioLevel('listening', levels, true), 0);
  assert.equal(interviewAudioLevel('speaking', levels, true), 0.4);
  for (const phase of ['idle', 'connecting', 'thinking', 'finished'] as const)
    assert.equal(interviewAudioLevel(phase, levels, false), 0);
  assert.equal(interviewVoiceStatus('finished'), 'ended');
});

test('bad or out of range meter readings cannot destabilize the shader', () => {
  for (const output of [NaN, Infinity, -1])
    assert.equal(
      interviewAudioLevel('speaking', { input: 0, output }, false),
      0,
    );
  assert.equal(
    interviewAudioLevel('speaking', { input: 0, output: 2 }, false),
    1,
  );
});

test('the screenshot report error gets contextual copy without blaming user input or showing the server body', () => {
  const issue = interviewIssueOf(responseError(400, 'invalid_input'), 'report');
  assert.deepEqual(issue, {
    kind: 'report',
    retryable: true,
    requestId: 'request-42',
  });
  const html = render(
    createElement(InterviewStatePanel, {
      title: i18n.t(`aiLab.interview.problem.${issue.kind}.title`),
      description: i18n.t(`aiLab.interview.problem.${issue.kind}.description`),
      onBack() {},
      onRetry() {},
      requestId: issue.requestId,
    }),
  );
  assert.match(html, /复盘报告暂时未能生成/);
  assert.match(html, /request-42/);
  assert.doesNotMatch(html, /填写有误|Not found/);
});

test('expired, forbidden and quota errors do not invite repeated generation', () => {
  for (const [status, code, kind] of [
    [404, undefined, 'missing'],
    [400, 'session_invalid', 'missing'],
    [403, undefined, 'access'],
    [403, 'quota_exceeded', 'quota'],
  ] as const) {
    assert.deepEqual(interviewIssueOf(responseError(status, code), 'restore'), {
      kind,
      retryable: false,
      requestId: 'request-42',
    });
  }
  assert.equal(interviewIssueOf(responseError(429), 'start').kind, 'busy');
  assert.equal(
    interviewIssueOf(new TypeError('Failed to fetch'), 'restore').kind,
    'connection',
  );
});

test('embedded agent renders no extra controls or caption; mute cannot hide interviewer speech', () => {
  const html = render(
    createElement(InterviewVoiceAgent, {
      phase: 'speaking',
      muted: true,
      readLevels: () => ({ input: 0.1, output: 0.6 }),
    }),
  );
  assert.match(html, /data-surface="embedded"/);
  assert.match(html, /data-status="speaking"/);
  assert.match(html, /data-muted="false"/);
  assert.doesNotMatch(
    html,
    /<button|voice-agent__transcript|voice-agent__header/,
  );
});

test('loading panel has a polite status and no accidental retry button', () => {
  const html = render(
    createElement(InterviewStatePanel, {
      busy: true,
      title: '正在整理复盘',
      description: '请稍候',
    }),
  );
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<button/);
});

// Replay the production callback to exercise archive recovery and bounded retry,
// without opening a room, microphone, or any paid upstream connection.
const source = ts.createSourceFile(
  'InterviewRoom.tsx',
  readFileSync(new URL('./InterviewRoom.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let loadReportCode = '';
function visit(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === 'loadReport' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    loadReportCode = ts.transpileModule(
      `(${node.initializer.arguments[0].getText(source)})`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
  }
  ts.forEachChild(node, visit);
}
visit(source);
async function replay(
  report: () => Promise<unknown>,
  archive: () => Promise<unknown>,
) {
  let saved: unknown,
    issue: unknown,
    archivedOnly = false,
    busy = false;
  let reportCalls = 0,
    archiveCalls = 0,
    attempted = false;
  const runtime = vm.createContext({
    sessionId: 'synthetic-session',
    fromAxiosError,
    interviewIssueOf,
    reportAttemptedRef: {
      get current() {
        return attempted;
      },
      set current(value: boolean) {
        attempted = value;
      },
    },
    setBusy: (value: boolean) => {
      busy = value;
    },
    setError() {},
    setReport: (value: unknown) => {
      saved = value;
    },
    setReportSkipped() {},
    setReportIssue: (value: unknown) => {
      issue = value;
    },
    setArchivedWithoutReport: (value: boolean) => {
      archivedOnly = value;
    },
    interviewApi: {
      report: async () => {
        reportCalls++;
        return report();
      },
      archived: async () => {
        archiveCalls++;
        return archive();
      },
    },
    setTimeout: (fn: () => void) => {
      fn();
    },
  });
  assert.ok(loadReportCode, 'production report callback must exist');
  await vm.runInContext(loadReportCode, runtime)();
  return {
    saved,
    issue,
    archivedOnly,
    busy,
    reportCalls,
    archiveCalls,
    attempted,
  };
}

test('failed generation recovers a saved report from the archive without a second generation', async () => {
  const cached = { overall: 80, band: 'good' };
  const state = await replay(
    async () => {
      throw responseError(502);
    },
    async () => ({ stage: 'finished', report: cached }),
  );
  assert.equal(state.saved, cached);
  assert.equal(state.reportCalls, 1);
  assert.equal(state.archiveCalls, 1);
  assert.equal(state.issue, null);
  assert.equal(state.busy, false);
  assert.equal(state.attempted, true);
});

test('expired hot session with a finished archive falls back to the transcript instead of retrying generation', async () => {
  const state = await replay(
    async () => {
      throw responseError(404);
    },
    async () => ({ stage: 'finished', report: null }),
  );
  assert.equal(state.archivedOnly, true);
  assert.equal(state.reportCalls, 1);
  assert.equal(state.issue, null);
});

test('unrecoverable report errors leave an actionable contextual state', async () => {
  const state = await replay(
    async () => {
      throw responseError(400, 'invalid_input');
    },
    async () => {
      throw responseError(404);
    },
  );
  assert.deepEqual(state.issue, {
    kind: 'report',
    retryable: true,
    requestId: 'request-42',
  });
  assert.equal(state.busy, false);
});

test('rate limits retry once and then stop; the archive remains the recovery path', async () => {
  const state = await replay(
    async () => {
      throw responseError(429);
    },
    async () => {
      throw responseError(404);
    },
  );
  assert.equal(state.reportCalls, 2);
  assert.equal(state.archiveCalls, 1);
  assert.equal((state.issue as { kind: string }).kind, 'busy');
  assert.equal(state.busy, false);
});
