export const packageNames = new Set(['resume-schema', 'resume-templates', 'design-system', 'icons', 'utils', 'mcp'].map(n => `@magic-resume-kit/${n}`));
export function parseVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`Expected an exact stable semver: ${value}`);
  return value.split('.').map(Number);
}
export function classifyUpdate(current, next) {
  const a = parseVersion(current), b = parseVersion(next);
  const index = b.findIndex((v, i) => v !== a[i]);
  if (index < 0 || b[index] < a[index]) return 'skip';
  return index === 0 ? 'major' : 'compatible';
}
export function validatePublished(packages) {
  if (!Array.isArray(packages)) throw new Error('Expected packages array');
  const seen = new Set();
  for (const pkg of packages) {
    if (!pkg || !packageNames.has(pkg.name) || seen.has(pkg.name)) throw new Error('Unknown or duplicate package');
    parseVersion(pkg.version); seen.add(pkg.name);
  }
  return packages;
}
