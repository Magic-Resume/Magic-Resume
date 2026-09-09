import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const distRoot = path.resolve(process.cwd(), 'dist');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(file)
      : file.endsWith('.js')
        ? [file]
        : [];
  });
}

function resolveRelative(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  const withExtension = `${base}.js`;
  if (fs.existsSync(withExtension)) return `${specifier}.js`;
  const index = path.join(base, 'index.js');
  if (fs.existsSync(index)) return `${specifier}/index.js`;
  return specifier;
}

let replacements = 0;
for (const file of walk(distRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(
    /(\b(?:from\s*|import\s*\()\s*['"])(\.[^'"]+)(['"])/g,
    (match, prefix, specifier, suffix) => {
      if (/\.(?:[cm]?js|json|node)$/.test(specifier)) return match;
      const resolved = resolveRelative(file, specifier);
      if (resolved === specifier) return match;
      replacements += 1;
      return `${prefix}${resolved}${suffix}`;
    },
  );
  if (updated !== original) fs.writeFileSync(file, updated);
}

console.log(`Fixed ${replacements} relative ESM import(s) in dist.`);
