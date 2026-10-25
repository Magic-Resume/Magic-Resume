import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Keeps the open-source app local-only.
 *
 * The editor stores data locally without login or billing. Optional BYOK AI
 * uses the server-only AI_BACKEND_URL through lib/ai/backend.ts. This check fails
 * when authentication, cloud storage or billing code comes back,
 * typically through a cherry-pick from a fork that still has them. The marketing
 * site and docs (`apps/landing`, `apps/docs`) describe the hosted product and are
 * out of scope.
 *
 * Legacy web tests are skipped while their fixtures are updated. Agent tests
 * and documentation are checked along with its runtime code.
 */

const root = process.cwd();

const scanRoots = [
  'apps/web/src',
  'apps/web/scripts',
  'apps/web/next.config.ts',
  'apps/web/package.json',
  'apps/web/Dockerfile',
  'apps/web/.env.example',
  'apps/agent',
  'packages',
];

const skipDirectories = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-verify',
  '.turbo',
  'storybook-static',
]);
const sourceFile =
  /\.(?:[cm]?[jt]sx?|json|css|ya?ml)$|(?:^|\/)(?:Dockerfile|\.env\.example)$/;
const testFile = /\.test\.[cm]?[jt]sx?$|(?:^|\/)scripts\/test-[^/]+$/;

const rules = [
  { pattern: /@clerk\//, reason: 'Clerk authentication' },
  { pattern: /\/api\/billing/, reason: 'billing routes' },
  { pattern: /serverFetchBackend/, reason: 'legacy hosted backend client' },
  {
    pattern: /extensions\/billing-client|api\/memoryApi|api\/conversationApi/,
    reason: 'hosted billing, memory or history client',
  },
  { pattern: /NEXT_PUBLIC_API_URL/, reason: 'hosted backend URL' },
  { pattern: /NEXT_PUBLIC_APP_MODE|isCloudMode/, reason: 'cloud mode switch' },
  { pattern: /livekit-client/, reason: 'voice interview runtime' },
  { pattern: /commercial/i, reason: 'commercial overlay' },
];

/**
 * Names of private repositories and reference sources, as SHA-256 digests of the
 * lowercase name: this file is public, so it must not spell out what it guards.
 * Checked across every tracked file, docs included.
 */
const privateNames = new Set([
  '07bf36a9f7365faa0318b2305b077fb7c3d8743e173eeb8f246069e610d9174c',
  '90705147dde942976c3f83006f435abd19cd144b03fda6a036e232ac944fa15d',
  '28b3b516f67e7c6a1dbcb6dc457ebc1e634d46197125208c7cdc4993c0a63e85',
  '6696a7047ec6c4f986f9e7cfb330189086fc762e43c84f52e66bdb100934d798',
  '1e0c3b6b5ba2fe256f07c0c00569e7b218f935085c06aeace6796fbafb460b28',
  'f236d274b7be60dfcff01ed9aef538fc3b9835c290459084e40e7dae174ebfbb',
  '05cbdf65624a5f02d15c8183c1ccc74191dc01eea770c71c3f194738ce53b8e7',
  '79ecd1d980a6220bdee81c3ee1b027a0108aa9237b21d75a5ced9eede796c32c',
]);
// The shared release helper selects behaviour by repository name.
const privateNameExceptions = new Set([
  '.github/release-pr/ensure-release-pr.cjs',
  '.github/release-pr/ensure-release-pr.test.cjs',
]);
const digest = (token) =>
  createHash('sha256').update(token.toLowerCase()).digest('hex');
const namesPrivateSource = (line) =>
  (line.match(/[\w.-]+/g) ?? []).some((token) =>
    privateNames.has(digest(token)),
  );

const files = [];
function collect(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return;
  if (fs.statSync(absolute).isFile()) {
    files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirectories.has(entry.name))
        collect(path.join(target, entry.name));
    } else {
      files.push(path.join(target, entry.name));
    }
  }
}
scanRoots.forEach(collect);

const violations = [];
for (const file of files) {
  const relative = file.split(path.sep).join('/');
  const isAgent = relative.startsWith('apps/agent/');
  if (!sourceFile.test(relative) && !(isAgent && /\.md$/.test(relative)))
    continue;
  if (!isAgent && testFile.test(relative)) continue;
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { pattern, reason } of rules) {
      if (pattern.test(line))
        violations.push(`${relative}:${index + 1}: ${reason} (${pattern})`);
    }
  });
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\0')
  .filter(
    (file) =>
      file &&
      !privateNameExceptions.has(file) &&
      file !== 'pnpm-lock.yaml' &&
      fs.existsSync(path.join(root, file)),
  );
for (const file of tracked) {
  const content = fs.readFileSync(path.join(root, file));
  if (content.includes(0)) continue;
  content
    .toString('utf8')
    .split('\n')
    .forEach((line, index) => {
      if (namesPrivateSource(line))
        violations.push(
          `${file}:${index + 1}: private repository or reference source`,
        );
    });
}

console.log(
  `Local-only files checked: ${files.length}; private-name scan: ${tracked.length}`,
);
if (violations.length > 0) {
  console.error('Local storage + BYOK boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Local-only check passed.');
}
