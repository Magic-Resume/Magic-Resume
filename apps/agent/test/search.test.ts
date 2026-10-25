import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readSettings } from '../src/config.js';
import { searchWeb, normalizeSearchResults } from '../src/search/client.js';
import { createWebSearch } from '../src/harness/tools/web-search.js';
import { createRunBudget } from '../src/harness/middleware/run-budget.js';
import { loadSkillCatalog } from '../src/harness/skills/catalog.js';
import { WorkspaceBackend } from '../src/harness/workspace/backend.js';
import { fixture, waitFor } from './helpers.js';
import { AgentError } from '../src/contracts/errors.js';
import ts from 'typescript';
import { Persistence } from '../src/persistence/store.js';

async function citationProjection(): Promise<{
  normalizeCitationSources(
    value: unknown,
  ): Array<{ sourceName?: string; citationId?: number }>;
  visibleCitationSources(value: unknown): unknown[];
}> {
  const source = await readFile(
    new URL(
      '../../web/src/app/dashboard/edit/_components/ai/conversation/citationSources.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
  );
}

const signal = () => new AbortController().signal;
const result = {
  title: 'Example company engineering',
  url: 'https://example.com/engineering',
  content: 'Example teams build accessible forms.',
  description: 'Example teams build accessible forms.',
  published_date: '2026-10-01',
};
async function service(t: TestContext) {
  const requests: Array<{
    path: string;
    method: string;
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  const state = {
    status: 200,
    redirect: false,
    hang: false,
    invalid: false,
    oversized: false,
    aborted: false,
  };
  const app = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push({
      path: request.url!,
      method: request.method!,
      headers: request.headers,
      body: raw ? JSON.parse(raw) : {},
    });
    response.once('close', () => {
      if (!response.writableEnded) state.aborted = true;
    });
    if (state.hang) return;
    if (state.redirect) {
      response.writeHead(302, { Location: '/never-follow' }).end();
      return;
    }
    if (state.status !== 200) {
      response
        .writeHead(state.status)
        .end('example-search-secret should never leave this response');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (state.invalid) {
      response.end('not json');
      return;
    }
    if (state.oversized) {
      response.end(' '.repeat(2_097_153));
      return;
    }
    response.end(
      JSON.stringify(
        request.url!.startsWith('/brave/')
          ? {
              web: {
                results: [
                  result,
                  result,
                  { url: 'javascript:invalid', title: 'Invalid' },
                ],
              },
            }
          : {
              results: [
                result,
                result,
                { url: 'javascript:invalid', title: 'Invalid' },
              ],
            },
      ),
    );
  });
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  const address = app.address();
  assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
  });
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    state,
  };
}

test('absent and incomplete search settings remove both tools and skills from discovery and direct reads', async (t) => {
  for (const env of [
    {},
    { SEARCH_PROVIDER: 'tavily' },
    { SEARCH_PROVIDER: 'brave' },
    { SEARCH_PROVIDER: 'searxng' },
    { SEARCH_PROVIDER: 'unknown', SEARCH_API_KEY: 'example-search-secret' },
    {
      SEARCH_PROVIDER: 'searxng',
      SEARCH_BASE_URL: 'https://user:secret@example.com',
    },
  ]) {
    assert.equal(readSettings(env).search, undefined);
    const f = await fixture(t, 'memory', [{ text: 'General answer.' }], env);
    await f.chat();
    assert.ok(
      !f.fake.requests[0].tools?.some(
        (tool) => tool.function.name === 'web_search',
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(f.fake.requests[0].messages),
      /web_search|company-research|job-research|Web search/,
    );
  }
  const settings = readSettings({});
  const catalog = loadSkillCatalog(settings.skillsDir);
  assert.ok(!catalog.has('company-research') && !catalog.has('job-research'));
  const backend = new WorkspaceBackend(settings.skillsDir, 'cocreate');
  for (const name of ['company-research', 'job-research']) {
    assert.ok((await backend.read(`/skills/${name}/SKILL.md`)).error);
    assert.ok((await backend.readRaw(`/skills/${name}/SKILL.md`)).error);
    assert.ok(
      (await backend.downloadFiles([`/skills/${name}/SKILL.md`]))[0].error,
    );
  }
  assert.doesNotMatch(
    JSON.stringify(await backend.ls('/skills/')),
    /company-research|job-research/,
  );
  assert.doesNotMatch(
    JSON.stringify(await backend.glob('**/SKILL.md', '/skills/')),
    /company-research|job-research/,
  );
  assert.doesNotMatch(
    JSON.stringify(await backend.grep('Research', '/skills/')),
    /company-research|job-research/,
  );
});

for (const provider of ['tavily', 'brave', 'searxng'] as const) {
  test(`${provider} performs its real REST request against a local service and normalizes results`, async (t) => {
    const s = await service(t);
    const settings = readSettings({
      NODE_ENV: 'test',
      AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
      SEARCH_PROVIDER: provider,
      SEARCH_API_KEY: 'example-search-secret',
      SEARCH_BASE_URL: `http://search.example.com:${s.port}/${provider}`,
    });
    let lookups = 0;
    const results = await searchWeb(
      settings.search!,
      'Example company TypeScript',
      3,
      settings,
      signal(),
      async () => {
        lookups++;
        return [{ address: '127.0.0.1', family: 4 }];
      },
    );
    assert.equal(lookups, 1);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      title: result.title,
      url: result.url,
      snippet: result.content,
      sourceName: 'example.com',
      publishedDate: '2026-10-01',
    });
    const sent = s.requests[0];
    assert.equal(sent.headers.host, `search.example.com:${s.port}`);
    if (provider === 'tavily') {
      assert.equal(sent.method, 'POST');
      assert.equal(sent.path, '/tavily/search');
      assert.equal(sent.headers.authorization, 'Bearer example-search-secret');
      assert.equal(sent.body.query, 'Example company TypeScript');
      assert.equal(sent.body.max_results, 3);
      assert.equal(sent.body.include_raw_content, false);
    } else {
      assert.equal(sent.method, 'GET');
      const url = new URL(sent.path, s.origin);
      assert.equal(url.searchParams.get('q'), 'Example company TypeScript');
      if (provider === 'brave') {
        assert.equal(url.pathname, '/brave/web/search');
        assert.equal(url.searchParams.get('count'), '3');
        assert.equal(
          sent.headers['x-subscription-token'],
          'example-search-secret',
        );
      } else {
        assert.equal(url.pathname, '/searxng/search');
        assert.equal(url.searchParams.get('format'), 'json');
        assert.equal(sent.headers.authorization, undefined);
      }
    }
    assert.doesNotMatch(JSON.stringify(results), /example-search-secret/);
  });
}

test('search policy blocks private and mixed DNS answers without explicit non-production opt-in', async (t) => {
  const s = await service(t);
  for (const env of [
    { NODE_ENV: 'development' },
    { NODE_ENV: 'production', AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true' },
  ]) {
    const settings = readSettings({
      ...env,
      SEARCH_PROVIDER: 'searxng',
      SEARCH_BASE_URL: `${s.origin}/searxng`,
    });
    await assert.rejects(
      searchWeb(settings.search!, 'Example', 5, settings, signal()),
      (error: unknown) =>
        error instanceof AgentError &&
        error.payload.subCode === 'search_host_blocked',
    );
  }
  const settings = readSettings({
    SEARCH_PROVIDER: 'searxng',
    SEARCH_BASE_URL: 'https://search.example.com',
  });
  await assert.rejects(
    searchWeb(settings.search!, 'Example', 5, settings, signal(), async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
    (error: unknown) =>
      error instanceof AgentError &&
      error.payload.subCode === 'search_host_blocked',
  );
  assert.equal(s.requests.length, 0);
});

test('search transport blocks redirects, bounds response bodies, sanitizes failures and propagates cancellation', async (t) => {
  const s = await service(t);
  const settings = readSettings({
    NODE_ENV: 'test',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
    SEARCH_PROVIDER: 'searxng',
    SEARCH_BASE_URL: `${s.origin}/searxng`,
  });
  s.state.redirect = true;
  await assert.rejects(
    searchWeb(settings.search!, 'Example', 5, settings, signal()),
    (error: unknown) =>
      error instanceof AgentError &&
      error.payload.subCode === 'search_redirect_blocked',
  );
  assert.equal(s.requests.length, 1);
  s.state.redirect = false;
  for (const status of [401, 403, 429, 500]) {
    s.state.status = status;
    await assert.rejects(
      searchWeb(settings.search!, 'Example', 5, settings, signal()),
      (error: unknown) => {
        assert.doesNotMatch(JSON.stringify(error), /example-search-secret/);
        return (
          error instanceof AgentError &&
          error.payload.subCode.startsWith('search_')
        );
      },
    );
  }
  s.state.status = 200;
  s.state.invalid = true;
  await assert.rejects(
    searchWeb(settings.search!, 'Example', 5, settings, signal()),
  );
  s.state.invalid = false;
  s.state.oversized = true;
  await assert.rejects(
    searchWeb(settings.search!, 'Example', 5, settings, signal()),
  );
  s.state.oversized = false;
  s.state.hang = true;
  const controller = new AbortController();
  const before = s.requests.length;
  const pending = searchWeb(
    settings.search!,
    'Example',
    5,
    settings,
    controller.signal,
  );
  await waitFor(() => s.requests.length > before);
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  await waitFor(() => s.state.aborted);
});

test('result counts and shared search budget are bounded, including concurrent tool execution', async (t) => {
  const s = await service(t);
  const settings = readSettings({
    NODE_ENV: 'test',
    AGENT_ALLOW_PRIVATE_MODEL_HOSTS: 'true',
    SEARCH_PROVIDER: 'searxng',
    SEARCH_BASE_URL: `${s.origin}/searxng`,
  });
  const budget = createRunBudget({ modelCalls: 5, toolCalls: 10, searches: 1 });
  const tool = createWebSearch(settings, budget, signal());
  const output = await Promise.all([
    tool.invoke({ query: 'Example one' }),
    tool.invoke({ query: 'Example two' }),
  ]);
  assert.equal(
    output.map(String).filter((text) => text.includes('run_limit_exhausted'))
      .length,
    1,
  );
  assert.equal(s.requests.length, 1);
  assert.equal(budget.counts().searches, 1);
  await assert.rejects(tool.invoke({ query: 'Example', count: 11 }));
  const limited = normalizeSearchResults(
    'tavily',
    { results: [result, { ...result, url: 'https://example.com/other' }] },
    1,
  );
  assert.equal(limited.length, 1);
});

test('HTTP search emits frontend-normalizable sources with matching tool IDs and resets its budget each turn', async (t) => {
  const { normalizeCitationSources, visibleCitationSources } =
    await citationProjection();
  const s = await service(t);
  const f = await fixture(
    t,
    'sqlite',
    [
      {
        calls: [
          { name: 'web_search', args: { query: 'Example company' } },
          { name: 'web_search', args: { query: 'Example team' } },
        ],
      },
      { text: 'The source describes accessible forms [1].' },
    ],
    {
      SEARCH_PROVIDER: 'tavily',
      SEARCH_API_KEY: 'example-search-secret',
      SEARCH_BASE_URL: `${s.origin}/tavily`,
      AGENT_MAX_SEARCHES: '1',
    },
  );
  const events = await f.chat(
    f.body({ agentMode: 'ask', sessionId: 'research' }),
  );
  assert.equal(s.requests.length, 1);
  const started = events.filter(
    (event) =>
      event.type === 'tool_started' && event.payload.toolName === 'web_search',
  );
  const updates = events.flatMap((event) =>
    event.type === 'source_update' ? [event.payload] : [],
  );
  assert.equal(updates.length, 2);
  const sources = updates.flatMap((event) =>
    normalizeCitationSources(event.sources),
  );
  assert.equal(visibleCitationSources(sources).length, 1);
  assert.equal(sources[0].sourceName, 'example.com');
  assert.equal(sources[0].citationId, 1);
  assert.ok(
    updates.every((event) =>
      started.some(
        (start) =>
          start.type === 'tool_started' &&
          start.payload.toolCallId === event.toolCallId,
      ),
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'tool_result' &&
        'result' in event.payload &&
        JSON.stringify(event.payload.result).includes('run_limit_exhausted'),
    ),
  );
  assert.doesNotMatch(JSON.stringify(f.fake.requests), /example-search-secret/);
  const persistence = new Persistence(f.dataDir);
  try {
    for await (const checkpoint of persistence.saver.list({
      configurable: { thread_id: 'research' },
    }))
      assert.doesNotMatch(JSON.stringify(checkpoint), /example-search-secret/);
  } finally {
    persistence.close();
  }
  f.fake.scripts.push(
    { calls: [{ name: 'web_search', args: { query: 'Example again' } }] },
    { text: 'Confirmed source [1].' },
  );
  await f.chat(f.body({ agentMode: 'ask', sessionId: 'research' }));
  assert.equal(s.requests.length, 2);
});

test('delegated searches share the root budget and publish their sources; searches also consume the normal tool budget', async (t) => {
  const s = await service(t);
  const env = {
    SEARCH_PROVIDER: 'searxng',
    SEARCH_BASE_URL: `${s.origin}/searxng`,
    AGENT_MAX_SEARCHES: '1',
  };
  const f = await fixture(
    t,
    'memory',
    [
      {
        calls: [
          {
            name: 'task',
            args: {
              subagent_type: 'general-purpose',
              description: 'Research one public source about Example company.',
            },
          },
        ],
      },
      { calls: [{ name: 'web_search', args: { query: 'Example company' } }] },
      { text: 'Child evidence [1].' },
      { calls: [{ name: 'web_search', args: { query: 'Example follow-up' } }] },
      { text: 'Summary based on the existing evidence [1].' },
    ],
    env,
  );
  const events = await f.chat();
  assert.equal(s.requests.length, 1);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'source_update' &&
        (event.payload.sources as unknown[]).length === 1,
    ),
  );
  assert.match(
    JSON.stringify(f.fake.requests.at(-1)?.messages),
    /run_limit_exhausted/,
  );
  const limited = await fixture(
    t,
    'memory',
    [
      { calls: [{ name: 'web_search', args: { query: 'Example first' } }] },
      { text: 'The remaining search needs another turn.' },
    ],
    { ...env, AGENT_MAX_TOOL_CALLS: '1' },
  );
  await limited.chat();
  assert.equal(limited.fake.requests[1].tool_choice, 'none');
});

test('enabled research skills are substantive and push both existing card contracts in real tool runs', async (t) => {
  const s = await service(t);
  const catalog = loadSkillCatalog(readSettings({}).skillsDir, true);
  for (const name of ['company-research', 'job-research']) {
    assert.ok(catalog.get(name)?.allowedTools.includes('web_search'));
    const source = await readFile(
      `${readSettings({}).skillsDir}/${name}/SKILL.md`,
      'utf8',
    );
    assert.match(source, /Source:/);
    assert.match(source, /Inference:/);
    assert.match(source, /unknown/);
    const kind = name.replace('-', '_');
    const f = await fixture(
      t,
      'memory',
      [
        {
          calls: [
            {
              name: 'read_file',
              args: { file_path: `/skills/${name}/SKILL.md` },
            },
          ],
        },
        {
          calls: [
            { name: 'web_search', args: { query: 'Example company role' } },
          ],
        },
        {
          calls: [
            {
              name: 'push_ui',
              args: {
                kind,
                props: {
                  title: 'Example brief',
                  jobTitle: 'Example role',
                  groups: [
                    {
                      key: 'skills',
                      title: 'Evidence',
                      items: [
                        {
                          text: 'Source: the example team builds accessible forms.',
                          url: result.url,
                          sourceName: 'example.com',
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
        { text: 'The sourced brief is ready [1].' },
      ],
      { SEARCH_PROVIDER: 'searxng', SEARCH_BASE_URL: `${s.origin}/searxng` },
    );
    const events = await f.chat(f.body({ agentMode: 'ask' }));
    assert.ok(
      events.some(
        (event) =>
          event.type === 'skill_loaded' && event.payload.skill === name,
      ),
    );
    assert.ok(
      events.some(
        (event) => event.type === 'ui_widget' && event.payload.kind === kind,
      ),
    );
    if (kind === 'job_research') {
      const card = events.find((event) => event.type === 'ui_widget');
      assert.ok(card?.type === 'ui_widget');
      const props = card.payload.props as {
        groups: Array<{ items: Array<{ text: string }> }>;
      };
      assert.match(
        props.groups[0].items[0].text,
        /\[Source\]\(https:\/\/example.com\/engineering\)/,
      );
    }
    assert.match(JSON.stringify(f.fake.requests[0].messages), new RegExp(name));
    assert.match(
      JSON.stringify(f.fake.requests[2].messages),
      /Example teams build accessible forms/,
    );
  }
});
