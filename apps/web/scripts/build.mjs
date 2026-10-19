#!/usr/bin/env node
/**
 * `next build` 的包装层：商业化 overlay 构建走 webpack，其余走 Next 16 默认的 Turbopack。
 *
 * overlay 的实现文件在另一个仓库里（`MAGIC_RESUME_COMMERCIAL_*_ROOT`），位于本 monorepo
 * 之外。Turbopack 只解析项目根目录内的文件，`resolveAlias` 里的绝对路径也会被当成相对
 * 项目根；而扩大 `turbopack.root` 会连带改变 standalone 产物的目录结构（Next 16 强制
 * `outputFileTracingRoot` 与之相同），商业镜像里写死的 `apps/web/server.js` 就找不到了。
 *
 * 所以带 overlay 的构建继续用已经验证过的 webpack 路径。`Magic-Resume-Commercial` 的构建
 * 脚本调用的就是 `npm run build`，不需要跟着改；显式传了 `--webpack` / `--turbopack` 时以
 * 命令行为准。
 */
import { spawn } from 'node:child_process';

const OVERLAY_ROOTS = [
  'MAGIC_RESUME_COMMERCIAL_RUNTIME_ROOT',
  'MAGIC_RESUME_COMMERCIAL_BILLING_ROOT',
  'MAGIC_RESUME_COMMERCIAL_LEGAL_ROOT',
];

// 裸 `--` 一并丢掉，理由同 `scripts/dev.mjs`。
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const overlay = OVERLAY_ROOTS.some((name) => process.env[name]);
const explicit = args.includes('--webpack') || args.includes('--turbopack');
const bundler = overlay && !explicit ? ['--webpack'] : [];

const next = new URL('../node_modules/next/dist/bin/next', import.meta.url);

const child = spawn(process.execPath, [next.pathname, 'build', ...bundler, ...args], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
