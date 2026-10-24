import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Keeps the open-source app local-only.
 *
 * Since v3 the editor runs entirely in the browser: no login, no hosted backend,
 * no billing. This check fails when code that needs one of those comes back,
 * typically through a cherry-pick from a fork that still has them. The marketing
 * site and docs (`apps/landing`, `apps/docs`) describe the hosted product and are
 * out of scope.
 *
 * Test files are skipped for now: several still reference modules v3 removed and
 * are due to be reworked together with the test setup.
 */

const root = process.cwd();

const scanRoots = [
  'apps/web/src',
  'apps/web/scripts',
  'apps/web/next.config.ts',
  'apps/web/package.json',
  'apps/web/Dockerfile',
  'apps/web/.env.example',
  'packages',
];

const skipDirectories = new Set(['node_modules', 'dist', '.next', '.next-verify', '.turbo', 'storybook-static']);
const sourceFile = /\.(?:[cm]?[jt]sx?|json|css|ya?ml)$|(?:^|\/)(?:Dockerfile|\.env\.example)$/;
const testFile = /\.test\.[cm]?[jt]sx?$|(?:^|\/)scripts\/test-[^/]+$/;

const rules = [
  { pattern: /@clerk\//, reason: 'Clerk authentication' },
  { pattern: /\/api\/billing/, reason: 'billing routes' },
  { pattern: /serverFetchBackend/, reason: 'hosted backend client' },
  { pattern: /NEXT_PUBLIC_API_URL/, reason: 'hosted backend URL' },
  { pattern: /NEXT_PUBLIC_APP_MODE|isCloudMode/, reason: 'cloud mode switch' },
  { pattern: /livekit-client/, reason: 'voice interview runtime' },
  { pattern: /commercial/i, reason: 'commercial overlay' },
];

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
      if (!skipDirectories.has(entry.name)) collect(path.join(target, entry.name));
    } else {
      files.push(path.join(target, entry.name));
    }
  }
}
scanRoots.forEach(collect);

const violations = [];
for (const file of files) {
  const relative = file.split(path.sep).join('/');
  if (!sourceFile.test(relative) || testFile.test(relative)) continue;
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { pattern, reason } of rules) {
      if (pattern.test(line)) violations.push(`${relative}:${index + 1}: ${reason} (${pattern})`);
    }
  });
}

console.log(`Local-only files checked: ${files.length}`);
if (violations.length > 0) {
  console.error('The open-source app is local-only. Remove the following:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Local-only check passed.');
}
