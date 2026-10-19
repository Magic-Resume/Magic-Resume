import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// The docs tell users to run `config print` and `config clear`; run the
// bundled CLI against a throwaway HOME so the real config is never touched.
const cli = new URL('../dist/cli.js', import.meta.url).pathname;

function run(home, ...args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('config set → print masks the PAT → clear removes the file', () => {
  const home = mkdtempSync(join(tmpdir(), 'magic-resume-cli-'));
  try {
    const token = 'mr_pat_0123456789abcdef';
    run(home, 'config', 'set', '--api-url', 'https://example.test/api', '--pat', token);

    const printed = run(home, 'config', 'print');
    assert.match(printed, /API URL:\s+https:\/\/example\.test\/api/);
    assert.match(printed, /PAT:\s+mr_pat_…cdef/);
    assert.ok(!printed.includes(token), 'print must never show the full PAT');

    assert.match(run(home, 'config', 'clear'), /Removed /);
    assert.ok(!existsSync(join(home, '.magic-resume', 'mcp.json')));
    assert.match(run(home, 'config', 'print'), /No config at /);
    assert.match(run(home, 'config', 'clear'), /nothing to clear/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
