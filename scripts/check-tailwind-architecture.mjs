import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const roots = [
  path.join(root, 'apps/web/src'),
  path.join(root, 'apps/landing/src'),
  path.join(root, 'packages/design-system/src'),
];

const sourceFiles = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx?|jsx?|astro)$/.test(entry.name)) sourceFiles.push(file);
  }
}
roots.forEach(walk);

const dynamicClassPattern = /(?:bg|text|border|ring|shadow|from|via|to)-\$\{/;
const arbitraryUtilityPattern =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|shadow|from|via|to|rounded|leading|tracking|w|h|min-w|max-w|min-h|max-h|top|right|bottom|left|inset|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y)-\[[^\]]+\]/g;
const legacyPrimitiveImportPattern =
  /(?:from|import\()\s*["'][^"']*(?:components\/(?:ui|base))["']/;
const violations = [];
let classExpressions = 0;
let arbitraryTokens = 0;

function collectUntrackedSourceFiles() {
  try {
    return execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((file) => /\.(tsx?|jsx?|astro)$/.test(file))
      .map((file) => path.join(root, file));
  } catch {
    // The check also runs from source archives without a .git directory.
    return [];
  }
}

const designSystemCssPath = path.join(
  root,
  'packages/design-system/styles/tokens.css',
);
const designSystemCss = fs.readFileSync(designSystemCssPath, 'utf8');
const definedTokens = new Set(
  [...designSystemCss.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(
    ([, token]) => `--${token}`,
  ),
);
const tokenReferences = new Map();
for (const match of designSystemCss.matchAll(
  /--([a-z0-9-]+)\s*:\s*([^;{}]+)/gi,
)) {
  const token = `--${match[1]}`;
  const refs = [...match[2].matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(
    ([, ref]) => ref,
  );
  tokenReferences.set(token, refs);
  for (const ref of refs) {
    if (!definedTokens.has(ref)) {
      violations.push(
        `packages/design-system/styles/tokens.css: undefined token ${ref} referenced by ${token}`,
      );
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visitToken(token, trail = []) {
  if (visiting.has(token)) {
    const cycle = [...trail, token].join(' -> ');
    violations.push(
      `packages/design-system/styles/tokens.css: circular token reference ${cycle}`,
    );
    return;
  }
  if (visited.has(token)) return;
  visiting.add(token);
  for (const ref of tokenReferences.get(token) ?? []) {
    if (definedTokens.has(ref)) visitToken(ref, [...trail, token]);
  }
  visiting.delete(token);
  visited.add(token);
}
for (const token of definedTokens) visitToken(token);

for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('className') || line.includes('class='))
      classExpressions += 1;
    if (dynamicClassPattern.test(line)) {
      violations.push(
        `${path.relative(root, file)}:${index + 1}: dynamic Tailwind class construction`,
      );
    }
    // Catch literal duplicate utilities (the safest class-conflict check) without
    // trying to second-guess intentional responsive/interactive variants.
    const classAttribute = line.match(
      /(?:className|class)\s*=\s*["'`]([^"'`$]+)["'`]/,
    )?.[1];
    if (classAttribute) {
      const tokens = classAttribute.trim().split(/\s+/);
      const duplicates = tokens.filter(
        (token, index) => tokens.indexOf(token) !== index,
      );
      if (duplicates.length) {
        violations.push(
          `${path.relative(root, file)}:${index + 1}: duplicate Tailwind class token(s): ${[...new Set(duplicates)].join(', ')}`,
        );
      }
    }
    arbitraryTokens += (line.match(arbitraryUtilityPattern) ?? []).length;
  });
}

// Compatibility primitives remain available during migration, but newly-created
// source files must enter through @magic-resume/design-system. Existing files are
// intentionally excluded so the migration can proceed incrementally.
for (const file of collectUntrackedSourceFiles()) {
  const content = fs.readFileSync(file, 'utf8');
  if (legacyPrimitiveImportPattern.test(content)) {
    violations.push(
      `${path.relative(root, file)}: new source must import @magic-resume/design-system instead of legacy ui/base primitives`,
    );
  }
}

for (const [file, css, requiredSources] of [
  [
    'apps/web/src/app/globals.css',
    fs.readFileSync(path.join(root, 'apps/web/src/app/globals.css'), 'utf8'),
    [
      '@source "../../../../packages/genui/src"',
      '@source "../../../../packages/resume-templates/src"',
      '@source "../../../../packages/design-system/src"',
    ],
  ],
  [
    'apps/landing/src/styles/global.css',
    fs.readFileSync(
      path.join(root, 'apps/landing/src/styles/global.css'),
      'utf8',
    ),
    ['@source "../../../../packages/design-system/src"'],
  ],
]) {
  if (!css.includes('@magic-resume/design-system/styles/tokens.css')) {
    violations.push(`${file}: missing design-system token import`);
  }
  for (const source of requiredSources) {
    if (!css.includes(source)) {
      violations.push(`${file}: missing ${source} directive`);
    }
  }
}

for (const file of sourceFiles.filter((candidate) =>
  candidate.startsWith(path.join(root, 'packages/design-system/src')),
)) {
  const content = fs.readFileSync(file, 'utf8');
  if (/#(?:[0-9a-f]{3,8})\b/i.test(content)) {
    violations.push(
      `${path.relative(root, file)}: shared design-system code must use semantic tokens instead of hex colors`,
    );
  }
  if (/\b(?:text|leading|shadow)-\[[^\]]+\]/.test(content)) {
    violations.push(
      `${path.relative(root, file)}: shared design-system code contains an arbitrary typography/shadow utility`,
    );
  }
}

console.log(`Tailwind source files: ${sourceFiles.length}`);
console.log(`class/className lines: ${classExpressions}`);
console.log(`arbitrary utility tokens: ${arbitraryTokens}`);

if (violations.length) {
  console.error('\nTailwind architecture violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Tailwind architecture check passed.');
}
