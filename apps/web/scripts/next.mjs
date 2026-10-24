#!/usr/bin/env node
/**
 * `next <command> …` with one fix: drop the bare `--` that pnpm passes through.
 *
 * `pnpm --filter @magic-resume/web dev -- -p 3000` hands the script
 * `-- -p 3000`, and `next dev` reads everything after `--` as positional, so
 * `-p` becomes the project directory ("Invalid project directory provided").
 * Every other argument goes to Next unchanged.
 */
import { spawn } from 'node:child_process';

const [command, ...rest] = process.argv.slice(2);
const args = rest.filter((arg) => arg !== '--');
const next = new URL('../node_modules/next/dist/bin/next', import.meta.url);

const child = spawn(process.execPath, [next.pathname, command, ...args], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
