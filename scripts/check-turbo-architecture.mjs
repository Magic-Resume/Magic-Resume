import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const turboPath = path.join(root, 'turbo.json');
const turbo = JSON.parse(fs.readFileSync(turboPath, 'utf8'));
const workspaceRoots = ['apps', 'packages'];
const devPackages = [];

for (const workspaceRoot of workspaceRoots) {
  const directory = path.join(root, workspaceRoot);
  if (!fs.existsSync(directory)) continue;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = path.join(directory, entry.name, 'package.json');
    if (!fs.existsSync(packagePath)) continue;
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (typeof pkg.scripts?.dev === 'string') {
      devPackages.push(`${workspaceRoot}/${entry.name}`);
    }
  }
}

const configured = turbo.concurrency ?? '10';
const numericConcurrency =
  typeof configured === 'number'
    ? configured
    : /^\d+(?:\.\d+)?$/.test(String(configured))
      ? Number(configured)
      : null;

console.log(`Persistent dev tasks: ${devPackages.length}`);
console.log(`Turbo concurrency: ${String(configured)}`);

if (numericConcurrency !== null && numericConcurrency <= devPackages.length) {
  console.error(
    `Turbo concurrency must be greater than persistent dev tasks (${devPackages.length}); configured ${numericConcurrency}.`,
  );
  process.exitCode = 1;
} else {
  console.log('Turbo architecture check passed.');
}
