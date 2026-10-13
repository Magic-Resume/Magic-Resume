'use strict';

const RELEASE_BRANCH = /^release-[A-Za-z0-9][A-Za-z0-9._-]*$/;

function releaseBranchFromEvent({ eventName, payload }) {
  if (eventName === 'workflow_dispatch') return payload.inputs?.release_branch;
  if (
    eventName !== 'pull_request_target' ||
    payload.action !== 'closed' ||
    payload.pull_request?.merged !== true
  )
    return null;
  const release = payload.pull_request.base.ref;
  return RELEASE_BRANCH.test(release) ? release : null;
}

async function findOpenPr(github, owner, repo, head, base) {
  const { data } = await github.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${head}`,
    base,
    per_page: 1,
  });
  return data[0];
}

async function planReleasePr({ github, owner, repo, head }) {
  if (!RELEASE_BRANCH.test(head || '')) {
    throw new Error('Expected a release-* branch in this repository.');
  }
  const { data: repository } = await github.rest.repos.get({ owner, repo });
  const base = repository.default_branch;
  if (!['main', 'master'].includes(base) || base === head) {
    throw new Error(`Unsupported release target: ${base}`);
  }
  const existing = await findOpenPr(github, owner, repo, head, base);
  if (existing) return { action: 'reuse', head, base, url: existing.html_url };

  let target, source;
  try {
    [target, source] = await Promise.all([
      github.rest.repos.getBranch({ owner, repo, branch: base }),
      github.rest.repos.getBranch({ owner, repo, branch: head }),
    ]);
  } catch (error) {
    // A queued merge event can outlive a deleted branch. Other failures matter.
    if (error.status === 404)
      return { action: 'skip', head, base, reason: 'branch-missing' };
    throw error;
  }
  if (
    target.data.commit.commit.tree.sha === source.data.commit.commit.tree.sha
  ) {
    return { action: 'skip', head, base, reason: 'identical-content' };
  }
  const { data: comparison } =
    await github.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${target.data.commit.sha}...${source.data.commit.sha}`,
      per_page: 1,
    });
  if (comparison.ahead_by === 0 || comparison.files.length === 0) {
    return { action: 'skip', head, base, reason: 'no-release-changes' };
  }
  // Squash merges leave different commit IDs. Compare the release's changed
  // paths against current main, even if main has since changed unrelated files.
  const trees = await Promise.all(
    [
      target.data.commit.commit.tree.sha,
      source.data.commit.commit.tree.sha,
      comparison.merge_base_commit.commit.tree.sha,
    ].map(async (tree_sha) => {
      const { data } = await github.rest.git.getTree({
        owner,
        repo,
        tree_sha,
        recursive: 'true',
      });
      if (data.truncated)
        throw new Error(
          'Cannot safely compare a truncated repository tree; create the release PR manually.',
        );
      return new Map(
        data.tree
          .filter((entry) => entry.type !== 'tree')
          .map((entry) => [
            entry.path,
            `${entry.mode}:${entry.type}:${entry.sha}`,
          ]),
      );
    }),
  );
  const [targetFiles, sourceFiles, ancestorFiles] = trees;
  const changed = [
    ...new Set([...sourceFiles.keys(), ...ancestorFiles.keys()]),
  ].filter((path) => sourceFiles.get(path) !== ancestorFiles.get(path));
  if (
    changed.every((path) => targetFiles.get(path) === sourceFiles.get(path))
  ) {
    return { action: 'skip', head, base, reason: 'changes-already-integrated' };
  }
  const body = [
    `将 \`${head}\` 合入 \`${base}\`，发布该 release 分支已集成的变更。`,
    '',
    `完整变更：[比较分支](${repository.html_url}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)})。`,
    '',
    '- 后续合入该 release 分支的提交会自动进入此 PR，无需重复创建。',
    '- 等待本 PR 的检查与人工审核后再合并；本自动化不批准或合并 PR。',
    '- 建议使用 Rebase and merge 保留功能提交和 gitmoji 发版语义；若选择 squash，请先核对发布标题。',
    ...(repo === 'Magic-Resume-Admin'
      ? ['- 发布 Admin 前，先确认对应 Core 版本已部署。']
      : []),
    '',
    '<!-- managed-by: auto-release-pr -->',
  ].join('\n');
  return {
    action: 'create',
    head,
    base,
    title: `release: ${head} → ${base}`,
    body,
  };
}

async function createReleasePr({ github, owner, repo, plan }) {
  if (plan.action !== 'create') return plan;
  // Recheck using the App token: a human may have opened a PR since planning.
  const existing = await findOpenPr(github, owner, repo, plan.head, plan.base);
  if (existing) return { action: 'reuse', url: existing.html_url };
  try {
    const { data } = await github.rest.pulls.create({
      owner,
      repo,
      head: plan.head,
      base: plan.base,
      title: plan.title,
      body: plan.body,
      draft: false,
    });
    return { action: 'created', url: data.html_url };
  } catch (error) {
    if (error.status === 422) {
      const raced = await findOpenPr(github, owner, repo, plan.head, plan.base);
      if (raced) return { action: 'reuse', url: raced.html_url };
      // Handle a branch merge/deletion between the comparison and POST, while
      // preserving validation errors when the branch still needs a release PR.
      const refreshed = await planReleasePr({
        github,
        owner,
        repo,
        head: plan.head,
      });
      if (refreshed.action !== 'create') return refreshed;
    }
    throw error;
  }
}

module.exports = { releaseBranchFromEvent, planReleasePr, createReleasePr };
