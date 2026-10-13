import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { campusPages, guidePages } from './public-knowledge.mjs';

export interface Exemplar {
  id: string; role: string; content: string; rationale?: string; sourceNote?: string;
  sourceResumeId: null | ''; status: 'active'; locale?: 'en' | 'zh';
}
export interface Timeline {
  id: string; company: string; season: string; title: string; stage?: string;
  sourceName: string; sourceUrl: string; updatedAt: string; openAt?: string; deadlineAt?: string;
}
export interface GuidePage { locale: 'en' | 'zh'; role: string; title: string; entries: Exemplar[] }
export interface CampusPage { season: string; company?: string; title: string; entries: Timeline[] }

async function load() {
  try { return JSON.parse(await readFile(resolve('.content-cache/knowledge.json'), 'utf8')); }
  catch { return { timelines: [], exemplars: [] }; }
}
const snapshot = load();
export async function getGuides(): Promise<GuidePage[]> { return guidePages((await snapshot).exemplars); }
export async function getCampus(): Promise<CampusPage[]> { return campusPages((await snapshot).timelines); }
export const campusHref = (page: CampusPage) => `/zh/campus/${page.season}${page.company ? `/${page.company}` : ''}`;
export const guideHref = (page: GuidePage) => `/${page.locale}/guides/${page.role}`;
