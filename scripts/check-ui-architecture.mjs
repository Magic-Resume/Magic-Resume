import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Static guard for the three-product-UI architecture.
 *
 * This deliberately checks source and documentation rather than generated
 * output. Git history is the archive for migration context; active files must
 * only expose Magic Resume's own names and seams.
 */

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', '.next', 'dist']);
const roots = [
  path.join(root, 'apps/web/src'),
  path.join(root, 'apps/landing/src'),
  path.join(root, 'apps/docs'),
  path.join(root, 'packages/genui/src'),
  path.join(root, 'packages/design-system/src'),
  path.join(root, 'docs'),
  path.join(root, 'README.md'),
  path.join(root, 'README.zh-CN.md'),
];

// Build forbidden spellings from fragments so this guard itself does not keep
// the retired vendor vocabulary alive in the repository-wide zero-match scan.
const externalWord = ['beau', 'tiful'].join('');
const landingWord = ['be', 'ui'].join('');
const boardWord = ['board', 'ui'].join('');
const titleExternalWord = externalWord[0].toUpperCase() + externalWord.slice(1);
const banned = new RegExp(
  `${externalWord}(?:\\s|-)?ui|${externalWord}ui\\.dev|\\b${landingWord}(?:[-_]|\\b)|boarder?\\s*ui|\\b${boardWord}\\b`,
  'i',
);
const oldGenUiImport = new RegExp(
  `@magic-resume/genui/${externalWord}|\\b${titleExternalWord}\\s*\\.`,
);
const sourceExtensions = /\.(?:[cm]?[jt]sx?|astro|css|md|mdx|json)$/i;
const violations = [];

function walk(entry) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    if (sourceExtensions.test(entry)) inspect(entry);
    return;
  }
  if (ignoredDirectories.has(path.basename(entry))) return;
  for (const child of fs.readdirSync(entry)) walk(path.join(entry, child));
}

function inspect(file) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (banned.test(line)) {
      violations.push(`${relative}:${index + 1}: legacy UI identity`);
    }
    if (oldGenUiImport.test(line)) {
      violations.push(`${relative}:${index + 1}: legacy GenUI import`);
    }
  });

  if (relative.startsWith('apps/web/src/')) {
    const isAi = relative.includes('/app/dashboard/edit/_components/ai/');
    const isGenUiFixture = relative.includes('/app/mock/genui/');
    const isGenUiTest = relative === 'apps/web/src/app.test.ts';
    const isAssetPreview = relative === 'apps/web/src/components/assets/AssetPreview.tsx';
    if (!isAi && !isGenUiFixture && !isGenUiTest && !isAssetPreview && /@magic-resume\/genui(?:["'/]|$)/.test(content)) {
      violations.push(`${relative}: non-GenUI Web source imports @magic-resume/genui`);
    }
    if (/['"]@\/components\/base(?:\/|['"])/.test(content)) {
      violations.push(`${relative}: imports deprecated components/base`);
    }
  }

  if (relative.startsWith('apps/landing/src/') && /@\/\.\.\/.*apps\/web|@magic-resume\/web|@magic-resume\/genui/.test(content)) {
    violations.push(`${relative}: landing imports Web or GenUI`);
  }

  if (relative.startsWith('packages/design-system/src/') && /apps\/web|apps\/landing|@magic-resume\/genui/.test(content)) {
    violations.push(`${relative}: design-system imports an application package`);
  }

  if (relative.startsWith('packages/genui/src/') && /apps\/web|apps\/landing/.test(content)) {
    violations.push(`${relative}: GenUI imports an application package`);
  }
}

for (const entry of roots) walk(entry);

const webCss = path.join(root, 'apps/web/src/app/globals.css');
const landingCss = path.join(root, 'apps/landing/src/styles/global.css');
for (const [file, required] of [
  [webCss, ['@magic-resume/design-system/styles/tokens.css', '@source "../../../../packages/genui/src"', '@source "../../../../packages/design-system/src"']],
  [landingCss, ['@magic-resume/design-system/styles/tokens.css', '@source "../../../../packages/design-system/src"']],
]) {
  if (!fs.existsSync(file)) continue;
  const css = fs.readFileSync(file, 'utf8');
  for (const token of required) {
    if (!css.includes(token)) violations.push(`${path.relative(root, file)}: missing ${token}`);
  }
}

if (violations.length) {
  console.error('UI architecture violations:');
  for (const violation of [...new Set(violations)]) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('UI architecture check passed.');
}
