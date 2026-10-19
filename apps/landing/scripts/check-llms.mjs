/*
 * Post-build guard for dist/llms.txt — the one index written for language
 * models. It once shipped with the Tools and Articles sections fused onto a
 * single line by a literal "\n" (`.join('\\n')`), and nothing failed.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const file = join(root, 'dist', 'llms.txt');
const text = await readFile(file, 'utf8');
const problems = [];

text.split('\n').forEach((line, index) => {
  if (line.includes('\\n')) problems.push(`line ${index + 1}: literal "\\n"`);
});
for (const heading of ['## Pages', '## Source', '## Tools', '## Articles']) {
  if (!text.includes(`\n${heading}\n`)) problems.push(`missing section "${heading}"`);
}

if (problems.length > 0) {
  console.error(`[llms-check] ${file} is malformed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('[llms-check] dist/llms.txt OK.');
