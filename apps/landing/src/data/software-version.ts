import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Changelog is newest-first; ignore prose, Unreleased and subheadings. */
export function parseSoftwareVersion(changelog: string): string | undefined {
  return /^# \[v(\d+\.\d+\.\d+)\]\([^\r\n)]+\) \(\d{4}-\d{2}-\d{2}\)\s*$/m.exec(changelog)?.[1];
}

// Astro builds run from apps/landing. Resolve from cwd, since import.meta.url
// points into dist once Astro bundles this module for static rendering.
export async function loadSoftwareVersion(path = resolve('../../CHANGELOG.md')): Promise<string | undefined> {
  try {
    return parseSoftwareVersion(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}
