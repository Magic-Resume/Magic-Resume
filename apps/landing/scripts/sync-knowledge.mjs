import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchPages } from './content-api.mjs';
import { publicExemplars, publicTimelines } from '../src/lib/public-knowledge.mjs';

export async function syncKnowledge({ root, apiBase }) {
  const snapshot = { timelines: [], exemplars: [] };
  if (apiBase) {
    for (const [key, path, select] of [
      ['timelines', '/api/knowledge/timelines', publicTimelines],
      ['exemplars', process.env.PUBLIC_EXEMPLAR_API_PATH || '/api/knowledge/exemplars', publicExemplars],
    ]) {
      try {
        // Public knowledge only: never call an admin endpoint or send a PAT.
        if (!path.startsWith('/api/knowledge/')) throw new Error('expected a public knowledge path');
        const rows = await fetchPages(`${apiBase}${path}`, { size: 50 });
        snapshot[key] = select(rows);
        console.log(`[content-sync] ${key}: ${snapshot[key].length}/${rows.length} eligible rows`);
      } catch (error) {
        console.warn(`[content-sync] ${key}: ${error.message}; no pages will be generated.`);
      }
    }
  }
  // Deliberately refresh, including empty results. Old provenance or publication
  // status must never keep a withdrawn knowledge entry public after an outage.
  const dir = join(root, '.content-cache');
  await mkdir(dir, { recursive: true });
  const target = join(dir, 'knowledge.json');
  await writeFile(`${target}.tmp`, JSON.stringify(snapshot), 'utf8');
  await rename(`${target}.tmp`, target);
}
