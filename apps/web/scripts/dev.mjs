#!/usr/bin/env node
/**
 * `next dev` 的包装层，只为一件事：**让商业化 overlay 变成显式选择**。
 *
 * 此前 overlay 的开关就是 `.env.local` 里那三个 `MAGIC_RESUME_COMMERCIAL_*_ROOT`。
 * 而它们一旦配上就一直在，于是 `pnpm dev` 永远带着商业化仓跑——想起一个干净的开源
 * 环境，只能去注释环境变量。
 *
 * 现在 dev 要两个条件同时成立：env 配了 root，**并且**命令行带了 `--commercial`。
 *
 * **只管 dev。** `next build` 维持原样（配了 root 就生效）——生产构建由
 * `Magic-Resume-Commercial/scripts/build-commercial-web.mjs` 显式注入 root 驱动，
 * 那里不存在「顺手带上」，给它加一道开关只会多一个能忘、且忘了就静默掉付费墙的地方。
 *
 * `next dev` 自己不认 `--commercial`（`error: unknown option`），所以这一层负责把它
 * 摘下来、翻译成环境变量，其余参数原样转交。
 */
import { spawn } from 'node:child_process';

const FLAG = '--commercial';
const argv = process.argv.slice(2);
// 裸 `--` 一并丢掉：`pnpm <script> -- --commercial` 会把分隔符原样传进来，
// 转给 `next dev` 就变成 `next dev --`。
const forwarded = argv.filter((arg) => arg !== FLAG && arg !== '--');

/*
 * 两个入口都要认：直接跑这个包时用 `--commercial`；从仓根经 turbo 进来时用环境变量
 * ——`turbo dev -- --commercial` 会把参数转发给**每一个**包，`tsc --watch --commercial`
 * 会当场报 TS5023，所以那条路只能走 env。
 */
const commercial =
  argv.includes(FLAG) || process.env.MAGIC_RESUME_COMMERCIAL === '1';

const next = new URL('../node_modules/next/dist/bin/next', import.meta.url);

const child = spawn(
  process.execPath,
  [next.pathname, 'dev', ...forwarded],
  {
    stdio: 'inherit',
    env: commercial
      ? { ...process.env, MAGIC_RESUME_COMMERCIAL: '1' }
      : process.env,
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
