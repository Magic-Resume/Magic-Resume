const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { appendFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { setTimeout } = require('node:timers/promises');

const OWNER_LABEL = 'com.magic-resume.ci.runtime';
const HOST_KEYS = [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
];

function configDirectory(directory, id) {
  return join(directory, `docker-${id}`);
}

function writeValue(file, name, value) {
  if (/[\r\n]/.test(String(value))) throw new Error(`Invalid ${name}`);
  appendFileSync(file, `${name}=${value}\n`);
}

function docker(exec, env, args) {
  return String(
    exec('docker', args, {
      env,
      encoding: 'utf8',
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ).trim();
}

async function setup({
  env = process.env,
  exec = execFileSync,
  sleep = setTimeout,
  id = randomUUID().replaceAll('-', '').slice(0, 12),
} = {}) {
  const network = `magic-ci-${id}`;
  const container = `${network}-docker`;
  const original = Object.fromEntries(
    HOST_KEYS.map((key) => [key, env[key] ?? null]),
  );
  writeValue(env.GITHUB_STATE, 'runtime_id', id);
  writeValue(env.GITHUB_STATE, 'host_env', JSON.stringify(original));
  const label = `${OWNER_LABEL}=${id}`;
  docker(exec, env, ['network', 'create', '--label', label, network]);
  docker(exec, env, [
    'run',
    '--detach',
    '--privileged',
    '--name',
    container,
    '--label',
    label,
    '--network',
    network,
    '--publish',
    '127.0.0.1::2375',
    '--env',
    'DOCKER_TLS_CERTDIR=',
    '--mount',
    `type=bind,source=${env.GITHUB_WORKSPACE},target=${env.GITHUB_WORKSPACE},readonly`,
    'docker:29.9.1-dind',
  ]);
  const details = JSON.parse(
    docker(exec, env, ['container', 'inspect', container]),
  )[0];
  const port = details.NetworkSettings.Ports['2375/tcp'][0];
  const address = details.NetworkSettings.Networks[network].IPAddress;
  if (port.HostIp !== '127.0.0.1' || !address) {
    throw new Error(
      'Docker runtime must use a private network and loopback API',
    );
  }
  const host = `tcp://127.0.0.1:${port.HostPort}`;
  const directory = configDirectory(env.RUNNER_TEMP, id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const values = {
    DOCKER_HOST: host,
    DOCKER_CONFIG: directory,
    DOCKER_CONTEXT: '',
    DOCKER_TLS_VERIFY: '',
    DOCKER_CERT_PATH: '',
    TESTCONTAINERS_HOST_OVERRIDE: address,
    TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE: '/var/run/docker.sock',
  };
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      docker(exec, { ...env, ...values }, ['info', '--format', '{{.ID}}']);
      ready = true;
      break;
    } catch {
      await sleep(2000);
    }
  }
  if (!ready) throw new Error('Isolated Docker runtime did not become ready');
  for (const [key, value] of Object.entries(values))
    writeValue(env.GITHUB_ENV, key, value);
  writeValue(env.GITHUB_OUTPUT, 'host', host);
  writeValue(env.GITHUB_OUTPUT, 'sock', host);
  console.log(`Docker runtime ready: ${container}`);
  return values;
}

function cleanup({ env = process.env, exec = execFileSync } = {}) {
  const id = env.STATE_runtime_id;
  if (!id || !/^[a-f0-9]{12}$/.test(id)) return;
  const hostEnv = { ...env };
  for (const [key, value] of Object.entries(JSON.parse(env.STATE_host_env))) {
    if (value === null) delete hostEnv[key];
    else hostEnv[key] = value;
  }
  const network = `magic-ci-${id}`;
  const container = `${network}-docker`;
  const owned = (kind, name) => {
    try {
      const details = JSON.parse(
        docker(exec, hostEnv, [kind, 'inspect', name]),
      )[0];
      return (
        (kind === 'container' ? details.Config.Labels : details.Labels)?.[
          OWNER_LABEL
        ] === id
      );
    } catch (error) {
      if (/No such|not found/i.test(String(error.stderr))) return false;
      throw error;
    }
  };
  // 只删除本任务的资源；宿主机的容器、镜像和网络不得清理。
  try {
    if (owned('container', container))
      docker(exec, hostEnv, [
        'container',
        'rm',
        '--force',
        '--volumes',
        container,
      ]);
    if (owned('network', network))
      docker(exec, hostEnv, ['network', 'rm', network]);
  } finally {
    rmSync(configDirectory(env.RUNNER_TEMP, id), {
      recursive: true,
      force: true,
    });
  }
}

module.exports = { setup, cleanup, configDirectory };
