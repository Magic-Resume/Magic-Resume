import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { packageNames, classifyUpdate, parseVersion, validatePublished } from './package-versions.mjs';
const manifests = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(f => /(^|\/)package\.json$/.test(f)).map(file => ({file, pkg: JSON.parse(readFileSync(file, 'utf8'))}));
const used = new Set();
for (const {pkg} of manifests) for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const name of Object.keys(pkg[section] || {})) if (packageNames.has(name)) used.add(name);
if (!used.size) throw new Error('Initial public package migration has not been applied');
let published;
if (process.env.PUBLISHED_PACKAGES) published = validatePublished(JSON.parse(process.env.PUBLISHED_PACKAGES));
else published = await Promise.all([...used].map(async name => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Registry ${name}: ${response.status}`);
  const {version} = await response.json(); parseVersion(version); return {name, version};
}));
const versions = new Map(published.map(p => [p.name, p.version]));
let major = false, changed = false;
for (const {file, pkg} of manifests) {
  let dirty = false;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const [name, current] of Object.entries(pkg[section] || {})) {
    if (!versions.has(name)) continue;
    const update = classifyUpdate(current, versions.get(name));
    if (update === 'skip') continue;
    major ||= update === 'major'; dirty = changed = true; pkg[section][name] = versions.get(name);
  }
  if (dirty) writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
}
if (changed) for (let attempt = 0; ; attempt++) {
  try { execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {stdio: 'inherit'}); break; }
  catch (error) { if (attempt === 2) throw error; await new Promise(r => setTimeout(r, 15000)); }
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nmajor=${major}\n`);
console.log(JSON.stringify({changed, major, packages: published.filter(p => used.has(p.name))}));
