'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  releaseBranchFromEvent,
  planReleasePr,
  createReleasePr,
} = require('./ensure-release-pr.cjs');

test('uses the release BASE of the merged feature PR as the new release PR HEAD', () => {
  assert.equal(
    releaseBranchFromEvent({
      eventName: 'pull_request_target',
      payload: {
        action: 'closed',
        pull_request: {
          merged: true,
          base: { ref: 'release-2026-10-13' },
          head: { ref: 'feature/announcement' },
        },
      },
    }),
    'release-2026-10-13',
  );
});

test('ignores closed but unmerged PRs and opened/synchronized PRs', () => {
  for (const [action, merged] of [
    ['closed', false],
    ['opened', true],
    ['synchronize', true],
  ]) {
    assert.equal(
      releaseBranchFromEvent({
        eventName: 'pull_request_target',
        payload: {
          action,
          pull_request: { merged, base: { ref: 'release-2026-10-13' } },
        },
      }),
      null,
    );
  }
});

test('does not create another release PR when a release PR merges into main/master', () => {
  for (const ref of ['main', 'master', 'feature/example']) {
    assert.equal(
      releaseBranchFromEvent({
        eventName: 'pull_request_target',
        payload: {
          action: 'closed',
          pull_request: { merged: true, base: { ref } },
        },
      }),
      null,
    );
  }
  assert.equal(
    releaseBranchFromEvent({
      eventName: 'push',
      payload: { ref: 'refs/heads/release-2026-10-13' },
    }),
    null,
  );
});

test('allows explicit manual recovery for an existing release branch', () => {
  assert.equal(
    releaseBranchFromEvent({
      eventName: 'workflow_dispatch',
      payload: { inputs: { release_branch: 'release-2026-10-13' } },
    }),
    'release-2026-10-13',
  );
});

function fixture(options = {}) {
  const calls = [];
  let lists = 0;
  const existing = {
    html_url: 'https://github.com/Magic-Resume/Example/pull/10',
  };
  const github = {
    rest: {
      repos: {
        get: async (args) => {
          calls.push(['repo', args]);
          return {
            data: {
              default_branch: options.base || 'main',
              html_url: 'https://github.com/Magic-Resume/Example',
            },
          };
        },
        getBranch: async (args) => {
          calls.push(['branch', args]);
          if (options.branchError && args.branch.startsWith('release-'))
            throw options.branchError;
          return {
            data: {
              commit: {
                sha: `${args.branch}-sha`,
                commit: {
                  tree: { sha: options.identical ? 'same-tree' : args.branch },
                },
              },
            },
          };
        },
        compareCommitsWithBasehead: async (args) => {
          calls.push(['compare', args]);
          return {
            data: {
              ahead_by: options.ahead ?? 1,
              files: options.files ?? [{ filename: 'app.ts' }],
              merge_base_commit: { commit: { tree: { sha: 'ancestor' } } },
            },
          };
        },
      },
      git: {
        getTree: async ({ tree_sha }) => {
          const source = tree_sha.startsWith('release-');
          const target = tree_sha === 'main' || tree_sha === 'master';
          const tree = options.trees?.[tree_sha] || [
            {
              path: 'app.ts',
              type: 'blob',
              mode: '100644',
              sha:
                source || (target && options.integrated)
                  ? 'new-code'
                  : 'old-code',
            },
            {
              path: '.github/ci.yml',
              type: 'blob',
              mode: '100644',
              sha: target ? 'new-ci' : 'old-ci',
            },
          ];
          return { data: { tree, truncated: options.truncated || false } };
        },
      },
      pulls: {
        list: async (args) => {
          calls.push(['list', args]);
          const found = options.openAt?.includes(lists++) || options.existing;
          return { data: found ? [existing] : [] };
        },
        create: async (args) => {
          calls.push(['create', args]);
          if (options.createError) throw options.createError;
          return { data: existing };
        },
      },
    },
  };
  return {
    github,
    calls,
    existing,
    owner: 'Magic-Resume',
    repo: options.repo || 'Example',
    head: options.head || 'release-2026-10-13',
  };
}

test('plans against main and master using the actual default branch', async () => {
  for (const base of ['main', 'master']) {
    const f = fixture({ base });
    const plan = await planReleasePr(f);
    assert.equal(plan.action, 'create');
    assert.equal(plan.base, base);
    assert.equal(plan.head, f.head);
    assert.match(plan.body, /Rebase and merge/);
    assert.deepEqual(f.calls.find(([name]) => name === 'compare')[1], {
      owner: f.owner,
      repo: f.repo,
      basehead: `${base}-sha...${f.head}-sha`,
      per_page: 1,
    });
  }
});

test('reuses an existing PR without comparing branches or editing human text', async () => {
  const f = fixture({ existing: true });
  assert.equal((await planReleasePr(f)).url, f.existing.html_url);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ['repo', 'list'],
  );
  assert.equal(f.calls[1][1].head, `Magic-Resume:${f.head}`);
  assert.equal(f.calls[1][1].state, 'open');
});

test('skips identical trees, including a squash-merged branch with different history', async () => {
  const f = fixture({ identical: true, ahead: 10 });
  assert.equal((await planReleasePr(f)).reason, 'identical-content');
  assert.equal(
    f.calls.some(([name]) => name === 'compare'),
    false,
  );
});

test('skips a behind branch and an empty merge-base diff', async () => {
  for (const options of [{ ahead: 0 }, { files: [] }]) {
    assert.equal(
      (await planReleasePr(fixture(options))).reason,
      'no-release-changes',
    );
  }
});

test('skips already squash-merged changes when main has newer unrelated CI commits', async () => {
  assert.equal(
    (await planReleasePr(fixture({ integrated: true }))).reason,
    'changes-already-integrated',
  );
});

test('compares file modes and deletions rather than only file contents', async () => {
  const file = {
    path: 'script.sh',
    type: 'blob',
    mode: '100644',
    sha: 'same-content',
  };
  for (const releaseTree of [[{ ...file, mode: '100755' }], []]) {
    const trees = {
      main: [file],
      ancestor: [file],
      'release-2026-10-13': releaseTree,
    };
    assert.equal((await planReleasePr(fixture({ trees }))).action, 'create');
  }
});

test('refuses a partial tree comparison instead of silently missing changes', async () => {
  await assert.rejects(
    planReleasePr(fixture({ truncated: true })),
    /truncated repository tree/,
  );
});

test('handles a release branch deleted while its job was queued', async () => {
  const f = fixture({ branchError: { status: 404 } });
  assert.equal((await planReleasePr(f)).reason, 'branch-missing');
});

test('does not hide authentication or network errors', async () => {
  for (const status of [403, 500]) {
    await assert.rejects(
      planReleasePr(fixture({ branchError: { status } })),
      (error) => error.status === status,
    );
  }
});

test('rejects unrelated refs and shell-like input before making API requests', async () => {
  for (const head of [
    'main',
    'master',
    'feature/test',
    '',
    'release-',
    'release-../main',
    'release-x\nmain',
    'release-$(id)',
    'other:release-2026-10-13',
  ]) {
    const f = fixture();
    await assert.rejects(planReleasePr({ ...f, head }), /Expected a release-/);
    assert.deepEqual(f.calls, []);
  }
});

test('accepts established legacy release names', async () => {
  for (const head of ['release-8-27', 'release-09-09', 'release-2026-10-13']) {
    assert.equal((await planReleasePr(fixture({ head }))).action, 'create');
  }
});

test('fails clearly if the repository no longer uses main/master', async () => {
  await assert.rejects(
    planReleasePr(fixture({ base: 'production' })),
    /Unsupported release target/,
  );
});

test('records Core-before-Admin deployment dependency', async () => {
  const plan = await planReleasePr(fixture({ repo: 'Magic-Resume-Admin' }));
  assert.match(plan.body, /先确认对应 Core 版本已部署/);
});

test('creates a regular release PR with the planned source and target', async () => {
  const f = fixture();
  const plan = await planReleasePr(f);
  assert.equal((await createReleasePr({ ...f, plan })).action, 'created');
  const create = f.calls.find(([name]) => name === 'create')[1];
  assert.equal(create.head, f.head);
  assert.equal(create.base, 'main');
  assert.equal(create.draft, false);
  assert.equal(create.body, plan.body);
  assert.equal(f.calls.filter(([name]) => name === 'create').length, 1);
});

test('does not write for skip or reuse plans', async () => {
  for (const action of ['skip', 'reuse']) {
    const f = fixture();
    assert.equal(
      (await createReleasePr({ ...f, plan: { action } })).action,
      action,
    );
    assert.deepEqual(f.calls, []);
  }
});

test('handles a human creating the PR after the read-only planning step', async () => {
  const f = fixture({ openAt: [1] });
  const plan = await planReleasePr(f);
  assert.equal((await createReleasePr({ ...f, plan })).action, 'reuse');
  assert.equal(
    f.calls.some(([name]) => name === 'create'),
    false,
  );
});

test('treats a duplicate-creation 422 as success only when the PR exists', async () => {
  const f = fixture({ createError: { status: 422 }, openAt: [2] });
  const plan = await planReleasePr(f);
  assert.equal((await createReleasePr({ ...f, plan })).action, 'reuse');
});

test('does not swallow unexplained GitHub validation errors', async () => {
  const error = { status: 422, message: 'Validation failed' };
  const f = fixture({ createError: error });
  const plan = await planReleasePr(f);
  await assert.rejects(
    createReleasePr({ ...f, plan }),
    (actual) => actual === error,
  );
});

test('does not retry a forbidden PR creation using another token', async () => {
  const error = { status: 403 };
  const f = fixture({ createError: error });
  const plan = await planReleasePr(f);
  await assert.rejects(
    createReleasePr({ ...f, plan }),
    (actual) => actual === error,
  );
  assert.equal(f.calls.filter(([name]) => name === 'create').length, 1);
});
