const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { setup, cleanup } = require('./runtime.cjs');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ci-docker-runtime-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'workspace'));
  const id = '0123456789ab';
  const network = `magic-ci-${id}`;
  const calls = [];
  const env = {
    RUNNER_TEMP: root,
    GITHUB_WORKSPACE: join(root, 'workspace'),
    GITHUB_STATE: join(root, 'state'),
    GITHUB_ENV: join(root, 'env'),
    GITHUB_OUTPUT: join(root, 'output'),
    DOCKER_HOST: 'unix:///host/docker.sock',
    DOCKER_CONFIG: '/host/config',
  };
  const exec = (_command, args, options) => {
    calls.push({ args, env: options.env });
    if (args[1] === 'inspect') {
      return JSON.stringify([
        {
          Config: { Labels: { 'com.magic-resume.ci.runtime': id } },
          Labels: { 'com.magic-resume.ci.runtime': id },
          NetworkSettings: {
            Ports: { '2375/tcp': [{ HostIp: '127.0.0.1', HostPort: '32123' }] },
            Networks: { [network]: { IPAddress: '172.25.0.2' } },
          },
        },
      ]);
    }
    return 'fixture-runtime';
  };
  const stateEnv = () =>
    Object.fromEntries(
      readFileSync(env.GITHUB_STATE, 'utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const index = line.indexOf('=');
          return [`STATE_${line.slice(0, index)}`, line.slice(index + 1)];
        }),
    );
  return { root, id, network, calls, env, exec, stateEnv };
}

test('runtime avoids docker0, binds its API to loopback, and exports reachable test ports', async (t) => {
  const f = fixture(t);
  const values = await setup({ env: f.env, exec: f.exec, id: f.id });
  const run = f.calls.find(({ args }) => args[0] === 'run').args;
  assert.equal(run[run.indexOf('--network') + 1], f.network);
  assert.equal(run[run.indexOf('--publish') + 1], '127.0.0.1::2375');
  assert.ok(
    run.includes(
      `type=bind,source=${f.env.GITHUB_WORKSPACE},target=${f.env.GITHUB_WORKSPACE},readonly`,
    ),
  );
  assert.equal(values.DOCKER_HOST, 'tcp://127.0.0.1:32123');
  assert.equal(values.TESTCONTAINERS_HOST_OVERRIDE, '172.25.0.2');
  assert.equal(
    values.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE,
    '/var/run/docker.sock',
  );
  assert.equal(values.DOCKER_CONFIG, join(f.root, `docker-${f.id}`));
  assert.match(
    readFileSync(f.env.GITHUB_ENV, 'utf8'),
    /DOCKER_HOST=tcp:\/\/127\.0\.0\.1:32123/,
  );
});

test('post cleanup uses the original host and removes only owned resources including volumes', async (t) => {
  const f = fixture(t);
  const values = await setup({ env: f.env, exec: f.exec, id: f.id });
  const start = f.calls.length;
  cleanup({ env: { ...f.env, ...values, ...f.stateEnv() }, exec: f.exec });
  const calls = f.calls.slice(start);
  assert.ok(calls.every(({ env }) => env.DOCKER_HOST === f.env.DOCKER_HOST));
  assert.ok(
    calls.every(({ env }) => env.DOCKER_CONFIG === f.env.DOCKER_CONFIG),
  );
  assert.deepEqual(
    calls.filter(({ args }) => args[1] === 'rm').map(({ args }) => args),
    [
      ['container', 'rm', '--force', '--volumes', `${f.network}-docker`],
      ['network', 'rm', f.network],
    ],
  );
});

test('post cleanup leaves resources owned by other jobs alone', async (t) => {
  const f = fixture(t);
  await setup({ env: f.env, exec: f.exec, id: f.id });
  const calls = [];
  cleanup({
    env: { ...f.env, ...f.stateEnv() },
    exec: (_command, args) => {
      calls.push(args);
      return JSON.stringify([{ Config: { Labels: {} }, Labels: {} }]);
    },
  });
  assert.ok(calls.every((args) => args[1] === 'inspect'));
});
