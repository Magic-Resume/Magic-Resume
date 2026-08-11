import assert from 'node:assert/strict';
import zhCopy from '@/locales/zh/translation.json';
import enCopy from '@/locales/en/translation.json';
import {
  fromErrorBody,
  fromSseEvent,
  fromThrown,
  isAborted,
} from '@/lib/errors/normalize';
import { appErrorCopy } from '@/lib/errors/message';
import { presentAppError } from '@/lib/errors/present';
import { APP_ERROR_CODES, opensBillingGate } from '@/lib/errors/types';
import { ZodError } from 'zod';
import {
  applyChangeToSections,
  buildSelectionChange,
  buildSelectionPreview,
  type EditResultLike,
} from '@/app/dashboard/edit/_components/ai/lib/changeModel';
import { diffResumeToChanges } from '@/app/dashboard/edit/_components/ai/lib/diffResume';
import {
  partitionByAnchor,
  toPendingView,
} from '@/app/dashboard/edit/_components/ai/lib/pendingView';
import {
  pathOf,
  type EditableTarget,
} from '@/app/dashboard/edit/_components/ai/lib/editableCanvas';
import {
  resolveResumePatchBatch,
  resolveResumePatchEvent,
} from '@/app/dashboard/edit/_components/ai/lib/resumePatch';
import {
  getApiErrorMessage,
  getMcpApiUrl,
  normalizeCloudResumes,
  shellQuote,
} from '@/lib/settings/mcpAccess';
import { afterAuthUrl } from '@/components/auth/afterAuthUrl';
import { migrateResume } from '@/lib/utils/resumeMigrations';
import {
  coerceSectionOrder,
  customSectionKey,
  isCustomSection,
  normalizeResumeSectionOrder,
} from '@/lib/utils/resumeSectionOrder';
import type { SectionOrder } from '@/types/frontend/resume';
import { shallowEqualArray } from '@/lib/utils/array';
import { hexToRgb, rgbToHex } from '@/lib/utils/color';
import { parseCssPixelValue } from '@/lib/utils/css';
import {
  formatCommentDate,
  formatCompactDateTime,
  formatShortDateTime,
  getCountdownTimeLeft,
} from '@/lib/utils/dateTime';
import { getFileSizeBucket } from '@/lib/utils/fileSize';
import { generateShortHash } from '@/lib/utils/hash';
import { getInitials } from '@/lib/utils/userDisplay';
import {
  formatResumeImportValidationError,
  validateAndNormalizeImportedResume,
} from '@/lib/validation/importResume';
import {
  AI_SESSION_TTL_MS,
  createAiSessionStore,
  getAiSessionStorageKey,
  type AiSessionSnapshot,
} from '@/store/useAiSessionStore';
import type { Resume, Section } from '@/types/frontend/resume';

class MemoryDb {
  items = new Map<string, unknown>();

  async setItem<T>(key: string, value: T): Promise<void> {
    this.items.set(key, structuredClone(value));
  }

  async getItem<T>(key: string): Promise<T | null> {
    return (structuredClone(this.items.get(key)) as T | undefined) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.items.keys());
  }
}

const baseSession = (overrides: Partial<AiSessionSnapshot> = {}): Partial<AiSessionSnapshot> => ({
  started: true,
  sessionId: 'session-a',
  sessionUsed: true,
  messages: [
    { id: 'm1', role: 'user', content: '帮我优化简历' },
    { id: 'm2', role: 'assistant', content: '当然可以。' },
  ],
  ...overrides,
});

const oldSentence =
  'Refactored critical resource-monitoring dashboards using Angular and RxJS, reducing memory leaks by 25% and improving data refresh intervals for massive clusters.';
const optimizedSentence =
  'Refactored resource-monitoring dashboards with Angular and RxJS, cutting memory leaks by 25% and reducing data refresh latency across large-scale clusters.';
const rewrittenSentence =
  'Redesigned critical resource-monitoring dashboards with Angular and RxJS, cutting memory leaks by 25% and accelerating data refresh rates for massive clusters.';

const beforeSummary = [
  '<p>Google Cloud Console UI Optimization</p>',
  '<ul>',
  `<li>${oldSentence}</li>`,
  '<li>Developed a specialized Web Worker layer to handle multi-threaded telemetry data processing, preventing main-thread blocking during peak load.</li>',
  '</ul>',
].join('');

const rewrittenSummary = [
  '<p>Google Cloud Console UI Optimization</p>',
  '<ul>',
  `<li>${rewrittenSentence}</li>`,
  '<li>Developed a specialized Web Worker layer to handle multi-threaded telemetry data processing, preventing main-thread blocking during peak load.</li>',
  '</ul>',
].join('');

const targetSelection = {
  path: 'sections.experience[google].summary',
  selectionText: oldSentence,
};

const resume: Resume = {
  id: 'resume-1',
  name: 'Kairo Resume',
  updatedAt: 1,
  info: {
    fullName: 'Kairo Chen',
    headline: '',
    email: '',
    phoneNumber: '',
    address: '',
    website: '',
    avatar: '',
  },
  sections: {
    experience: [
      { id: 'google', visible: true, company: 'Google', summary: beforeSummary },
      { id: 'bytedance', visible: true, company: 'ByteDance', summary: '<p>Unchanged</p>' },
    ],
  },
  sectionOrder: [{ key: 'experience', label: 'Experience' }],
  template: 'classic',
  themeColor: '#f97316',
  typography: 'inter',
};

async function testAiSessionStore() {
  {
    const now = 1_000;
    const db = new MemoryDb();
    const store = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => 'fresh-session',
      persistDelayMs: 0,
    });

    await store.getState().patchSession('resume-a', baseSession());
    await store.getState().patchSession('resume-a', {
      analysis: {
        overall_score: 83,
        category_averages: { impact: 80 },
        peer_analysis: {
          persona: 'peer_developer',
          score: 82,
          categories_scores: { impact: 80 },
          strengths: ['技术栈扎实'],
          weaknesses: ['结果量化不足'],
          suggestions: ['补充性能数据'],
        },
        leader_analysis: {
          persona: 'tech_lead',
          score: 84,
          categories_scores: { impact: 84 },
          strengths: ['项目复杂度不错'],
          weaknesses: ['业务影响表达弱'],
          suggestions: ['突出负责范围'],
        },
        hrbp_analysis: {
          persona: 'hrbp',
          score: 83,
          categories_scores: { impact: 82 },
          strengths: ['经历完整'],
          weaknesses: ['关键词覆盖不足'],
          suggestions: ['补充岗位关键词'],
        },
      },
    });
    await store.getState().flushSession('resume-a');

    const reloaded = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => 'unused',
      persistDelayMs: 0,
    });
    const session = await reloaded.getState().loadSession('resume-a');

    assert.equal(session.sessionId, 'session-a');
    assert.equal(session.sessionUsed, true);
    assert.equal(session.messages.length, 2);
    assert.equal(session.messages[0].content, '帮我优化简历');
    assert.equal(session.analysis?.overall_score, 83);
  }

  {
    const db = new MemoryDb();
    const store = createAiSessionStore({
      db,
      now: () => 2_000,
      idFactory: () => 'new-session',
      persistDelayMs: 0,
    });

    await store.getState().patchSession('resume-a', baseSession({ sessionId: 'session-a' }));
    await store.getState().patchSession('resume-b', baseSession({ sessionId: 'session-b', messages: [] }));
    await store.getState().flushSession('resume-a');
    await store.getState().flushSession('resume-b');

    const a = await store.getState().loadSession('resume-a');
    const b = await store.getState().loadSession('resume-b');

    assert.equal(a.sessionId, 'session-a');
    assert.equal(a.messages.length, 2);
    assert.equal(b.sessionId, 'session-b');
    assert.equal(b.messages.length, 0);
  }

  {
    const now = 10_000 + AI_SESSION_TTL_MS;
    const db = new MemoryDb();
    await db.setItem(getAiSessionStorageKey('resume-a'), {
      ...baseSession(),
      updatedAt: 9_999,
    });
    const store = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => 'fresh-after-expiry',
      persistDelayMs: 0,
    });

    const session = await store.getState().loadSession('resume-a');

    assert.equal(session.sessionId, 'fresh-after-expiry');
    assert.equal(session.started, false);
    assert.equal(session.messages.length, 0);
    assert.equal(db.items.has(getAiSessionStorageKey('resume-a')), false);
  }

  {
    const db = new MemoryDb();
    const ids = ['first-session', 'second-session'];
    const store = createAiSessionStore({
      db,
      now: () => 3_000,
      idFactory: () => ids.shift() ?? 'fallback-session',
      persistDelayMs: 0,
    });

    await store.getState().patchSession('resume-a', baseSession());
    const reset = store.getState().resetSession('resume-a');
    await store.getState().flushSession('resume-a');

    assert.equal(reset.sessionId, 'second-session');
    assert.equal(reset.sessionUsed, false);
    assert.equal(reset.started, false);
    assert.equal(reset.messages.length, 0);
    assert.equal(reset.analysis, null);
  }
}

function testImportResumeValidation() {
  const normalized = validateAndNormalizeImportedResume({
    name: 'Imported Resume',
    isPublic: true,
    shareId: 'public-share',
    shareRole: 'VIEWER',
    info: {
      fullName: 'Ada Lovelace',
    },
    sections: {
      experience: [
        {
          id: 'exp-1',
          company: 'Analytical Engines',
          extraBackendField: 'kept',
        },
      ],
      customSection: [
        {
          id: 'custom-1',
          title: 'Notes',
        },
      ],
    },
    sectionOrder: [{ key: 'experience', label: 'Experience' }],
  });

  assert.equal(normalized.isPublic, undefined);
  assert.equal(normalized.shareId, undefined);
  assert.equal(normalized.shareRole, undefined);
  assert.equal(normalized.info.fullName, 'Ada Lovelace');
  assert.equal(normalized.info.email, '');
  assert.equal(normalized.sections.experience[0].visible, true);
  assert.equal(normalized.sections.experience[0].extraBackendField, 'kept');
  assert.deepEqual(normalized.sections.education, []);
  // A custom section survives with its content. The id is reissued — imported
  // ids are whatever the source said, and the app mints its own with nanoid.
  const customItems = normalized.sections.customSection as { id: string; title: string }[];
  assert.equal(customItems.length, 1);
  assert.equal(customItems[0].title, 'Notes');
  assert.match(customItems[0].id, /^[A-Za-z0-9_-]{21}$/);
  assert.deepEqual(normalized.sectionOrder.map(({ key }) => key), [
    'basics',
    'experience',
    'projects',
    'education',
    'skills',
    'languages',
    'certificates',
    'customSection',
  ]);

  const repairedEmptyOrder = validateAndNormalizeImportedResume({
    info: {},
    sections: {},
    sectionOrder: [],
  });
  assert.deepEqual(repairedEmptyOrder.sectionOrder.map(({ key }) => key), [
    'basics',
    'projects',
    'education',
    'skills',
    'languages',
    'certificates',
    'experience',
  ]);

  const message = formatResumeImportValidationError(
    new ZodError([
      {
        code: 'custom',
        path: ['sectionOrder'],
        message: 'Array must contain at least 1 element(s)',
      },
    ]),
  );

  assert.equal(message, 'Invalid resume format: sectionOrder: Array must contain at least 1 element(s)');
}

function testUtilityFunctions() {
  const first = ['summary', 'experience'];
  assert.equal(shallowEqualArray(first, first), true);
  assert.equal(shallowEqualArray(['summary', 'experience'], ['summary', 'experience']), true);
  assert.equal(shallowEqualArray(['summary'], ['summary', 'experience']), false);
  assert.equal(shallowEqualArray(['experience', 'summary'], ['summary', 'experience']), false);

  assert.deepEqual(hexToRgb('#38bdf8'), { r: 56, g: 189, b: 248 });
  assert.deepEqual(hexToRgb('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb(' #abc '), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb(' 38BDF8 '), { r: 56, g: 189, b: 248 });
  assert.equal(hexToRgb('#abcd'), null);
  assert.equal(hexToRgb('not-a-color'), null);
  assert.equal(rgbToHex(56, 189, 248), '#38bdf8');
  assert.equal(rgbToHex(255.4, -4, 300), '#ff00ff');

  assert.equal(parseCssPixelValue('360px'), 360);
  assert.equal(parseCssPixelValue(' 16px '), 16);
  assert.equal(parseCssPixelValue('12.5px'), 12);
  assert.equal(parseCssPixelValue('auto'), 0);
  assert.equal(parseCssPixelValue(''), 0);

  const t = (key: string) => (key === 'sharedPage.comments.justNow' ? 'Just now translated' : key);
  assert.equal(formatCommentDate('', t), 'Just now translated');
  assert.equal(formatCommentDate('Just now', t), 'Just now translated');
  assert.equal(formatCommentDate('not-a-date', t), 'not-a-date');
  assert.equal(formatShortDateTime(new Date('2026-07-03T08:09:00Z'), 'en-US', 'UTC'), 'Jul 3, 08:09 AM');
  assert.equal(formatCompactDateTime(undefined), '');
  assert.equal(formatCompactDateTime(Date.UTC(2026, 6, 3, 8, 9), 'zh-CN', 'UTC'), '7/3 08:09');
  assert.deepEqual(getCountdownTimeLeft((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000, 0), {
    days: 2,
    hours: 3,
    minutes: 4,
    seconds: 5,
  });
  assert.deepEqual(getCountdownTimeLeft(1000, 5000), { days: 0, hours: 0, minutes: 0, seconds: 0 });

  assert.equal(getFileSizeBucket(0), 'small');
  assert.equal(getFileSizeBucket(512 * 1024 - 1), 'small');
  assert.equal(getFileSizeBucket(512 * 1024), 'medium');
  assert.equal(getFileSizeBucket(2 * 1024 * 1024 - 1), 'medium');
  assert.equal(getFileSizeBucket(2 * 1024 * 1024), 'large');

  assert.equal(generateShortHash('version-123'), generateShortHash('version-123'));
  assert.match(generateShortHash('version-123'), /^[0-9a-f]{7}$/);
  assert.notEqual(generateShortHash('version-123'), generateShortHash('completely-different-version'));

  assert.equal(getInitials('Ada Lovelace', null), 'AL');
  assert.equal(getInitials('  Grace   Hopper  ', null), 'GH');
  assert.equal(getInitials('Kai', null), 'KA');
  assert.equal(getInitials(null, 'user@example.com'), 'US');
  assert.equal(getInitials(null, null), '');
}

function testMcpAccessHelpers() {
  assert.equal(getMcpApiUrl('https://example.com'), 'https://example.com/api');
  assert.equal(getMcpApiUrl('https://example.com/api/'), 'https://example.com/api');
  assert.equal(shellQuote("abc'def"), "'abc'\\''def'");
  assert.deepEqual(normalizeCloudResumes([{ id: '1', name: 'Resume A' }]), [
    { id: '1', title: 'Resume A' },
  ]);
  assert.deepEqual(normalizeCloudResumes({ data: { data: [{ id: '2', title: 'Resume B' }] } }), [
    { id: '2', title: 'Resume B' },
  ]);
  assert.deepEqual(normalizeCloudResumes([{ title: 'missing id' }]), []);
  assert.equal(getApiErrorMessage({ isAxiosError: true, response: { data: { message: 'Nope' } } }), 'Nope');
  assert.equal(getApiErrorMessage(new Error('plain')), null);
}

function testAiLib() {
  const preview = buildSelectionPreview(beforeSummary, rewrittenSummary, oldSentence);
  assert.deepEqual(preview, {
    previewBefore: oldSentence,
    previewAfter: rewrittenSentence,
    previewKind: 'text',
  });

  const target: EditableTarget = {
    sectionKey: 'experience',
    itemId: 'google',
    fieldKey: 'summary',
    kind: 'html',
    label: 'Selected segment',
  };

  const result: EditResultLike = {
    after: rewrittenSummary,
    rationale: 'More active wording.',
  };

  const change = buildSelectionChange(target, beforeSummary, oldSentence, 'free', result, {
    freeText: 'Make it stronger',
  });

  assert.equal(change.before, beforeSummary);
  assert.equal(change.after, rewrittenSummary);
  assert.equal(change.previewBefore, oldSentence);
  assert.equal(change.previewAfter, rewrittenSentence);
  assert.equal(change.previewKind, 'text');

  const current: Section = {
    experience: [
      { id: 'google', visible: true, company: 'Google', summary: beforeSummary },
      { id: 'bytedance', visible: true, company: 'ByteDance', summary: '<p>Unchanged</p>' },
    ],
  };

  const proposed: Section = {
    experience: [
      { id: 'google', visible: true, company: 'Google', summary: rewrittenSummary },
      { id: 'bytedance', visible: true, company: 'ByteDance', summary: '<p>Unchanged</p>' },
    ],
  };

  const changes = diffResumeToChanges(current, proposed, 'optimize', undefined, targetSelection);

  assert.equal(changes.length, 1);
  assert.equal(pathOf(changes[0].target), targetSelection.path);
  assert.equal(changes[0].before, beforeSummary);
  assert.equal(changes[0].after, rewrittenSummary);
  assert.equal(changes[0].previewBefore, oldSentence);
  assert.equal(changes[0].previewAfter, rewrittenSentence);
  assert.equal(changes[0].previewKind, 'text');

  const resolved = resolveResumePatchEvent(
    resume,
    { oldString: oldSentence, newString: optimizedSentence },
    targetSelection,
  );

  assert.ok(resolved);
  assert.equal(
    resolved.resume.sections.experience[0].summary,
    beforeSummary.replace(oldSentence, optimizedSentence),
  );
  assert.equal(resolved.resume.sections.experience[1].summary, '<p>Unchanged</p>');
  assert.deepEqual(resolved.targetedSelection, targetSelection);

  const fallback = resolveResumePatchEvent(resume, { oldString: oldSentence, newString: optimizedSentence });
  assert.ok(fallback);
  assert.deepEqual(fallback.targetedSelection, targetSelection);

  const untouched = resolveResumePatchEvent(resume, { oldString: 'missing', newString: 'replacement' });
  assert.equal(untouched, null);

  const chatPatchBatch = resolveResumePatchBatch(resume, {
    oldString: oldSentence,
    newString: optimizedSentence,
  });
  assert.ok(chatPatchBatch);
  assert.equal(chatPatchBatch.kind, 'optimize');
  assert.equal(chatPatchBatch.proposedSections.experience[0].summary, beforeSummary.replace(oldSentence, optimizedSentence));
  assert.deepEqual(chatPatchBatch.targetedSelection, targetSelection);

  const translatePatchBatch = resolveResumePatchBatch(
    resume,
    { oldString: oldSentence, newString: optimizedSentence },
    { kind: 'translate', lang: 'English' },
  );
  assert.ok(translatePatchBatch);
  assert.equal(translatePatchBatch.kind, 'translate');
  assert.equal(translatePatchBatch.lang, 'English');
}

function testImportedItemIds() {
  // An imported id used to be whatever the source said — for a PDF, whatever
  // the model wrote, and the model copies the prompt example, so real resumes
  // arrived full of `skill-1` / `exp-1`. Nothing deduplicated them either, so a
  // model numbering two sections from 1 produced colliding React keys and a
  // drag list that reordered the wrong row.
  const normalized = validateAndNormalizeImportedResume({
    info: {},
    sections: {
      experience: [{ id: 'exp-1' }, { id: 'exp-1' }],
      skills: [{ id: 'skill-1' }],
      personalStrengths: [{ id: 'skill-1' }],
    },
    sectionOrder: [{ key: 'experience', label: 'Experience' }],
  });

  const ids = Object.values(normalized.sections).flatMap((items) =>
    (items as { id: string }[]).map((i) => i.id),
  );
  assert.equal(ids.length, 4);
  // Same shape the app mints for itself (nanoid, 21 URL-safe chars).
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{21}$/);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  // A custom section survives the reissue, keys and all.
  assert.ok(normalized.sections.personalStrengths);
}

function testResumeMigrations() {
  // `summary` is the only rich-text field the editor edits and twelve of the
  // thirteen templates render. Prose stranded in `description` by an older
  // import is stored, invisible and un-editable.
  const migrated = migrateResume({
    id: 'r1',
    sectionOrder: [{ key: 'basics', label: 'Basics' }],
    sections: {
      skills: [
        { id: 'a', visible: true, description: '<p>正文</p>' },
        { id: 'b', visible: true, summary: '<p>已有</p>', description: '次要' },
        { id: 'c', visible: true, summary: '   ', description: '<p>空白也算空</p>' },
      ],
    },
  } as never);

  assert.equal(migrated.sections.skills[0].summary, '<p>正文</p>');
  // Never overwrite a summary the resume already had.
  assert.equal(migrated.sections.skills[1].summary, '<p>已有</p>');
  assert.equal(migrated.sections.skills[2].summary, '<p>空白也算空</p>');
  // Left in place — product-ops-focus reads it.
  assert.equal(migrated.sections.skills[0].description, '<p>正文</p>');

  // `basics` drives the editor's first form; a resume written before it existed
  // opens without the name/contact fields.
  const noBasics = migrateResume({
    id: 'r2',
    sectionOrder: [{ key: 'experience', label: 'Experience' }],
    sections: {},
  } as never);
  assert.equal(noBasics.sectionOrder[0].key, 'basics');

  // Nothing to repair → the same object back, so callers can skip the write
  // and avoid a spurious "modified" sync status.
  const clean = {
    id: 'r3',
    sectionOrder: [{ key: 'basics', label: 'Basics' }],
    sections: { skills: [{ id: 'a', visible: true, summary: '<p>x</p>' }] },
  } as never;
  assert.equal(migrateResume(clean), clean);
}

function testCustomSections() {
  // Only sections the app did not define can be renamed or deleted. A built-in's
  // label is an i18n key (`sections.skills`), so renaming one would swap a
  // translated string for a literal and break every other language; deleting one
  // would remove a form the editor expects to exist.
  for (const builtin of ['basics', 'experience', 'education', 'projects', 'skills', 'languages', 'certificates']) {
    assert.equal(isCustomSection(builtin), false, `${builtin} must be protected`);
  }
  assert.equal(isCustomSection('personalStrengths'), true);
  assert.equal(isCustomSection('个人优势'), true);

  // Keys are derived from the title for readable JSON, but never trusted to be
  // unique or even expressible in ascii.
  assert.equal(customSectionKey('Personal Highlights', []), 'personal-highlights');
  assert.equal(customSectionKey('  Awards!  ', []), 'awards');
  // A Chinese title slugs to nothing — it still needs a key.
  assert.equal(customSectionKey('个人优势', []), 'section');
  assert.equal(customSectionKey('个人优势', ['section']), 'section-2');
  assert.equal(customSectionKey('Awards', ['awards', 'awards-2']), 'awards-3');

  // A custom section survives order normalisation with its label intact, which
  // is what the editor and the renderer both title it from.
  const order = normalizeResumeSectionOrder(
    [{ key: 'personalStrengths', label: '个人优势' }],
    { personalStrengths: [], skills: [] },
  );
  assert.deepEqual(
    order.find((s) => s.key === 'personalStrengths'),
    { key: 'personalStrengths', label: '个人优势' },
  );
  // …and the built-ins are still all present, so no form disappears.
  for (const builtin of ['basics', 'skills', 'experience']) {
    assert.ok(order.some((s) => s.key === builtin), `${builtin} missing from order`);
  }
}

/**
 * 「失败必须有声」的回归。
 *
 * 这条链路上原本有八处静默丢弃，用户那边的表现完全一样：模型说「已经改好了」，画布纹丝
 * 不动，没有任何东西告诉他刚才什么都没发生。这里钉住其中两条最要命的。
 */
function testAiFailuresAreVisible() {
  const current: Section = {
    experience: [{ id: 'exp-1', visible: true, summary: '<p>Old</p>' }],
  };

  // ① agent 重建了 id：每一条改动都在 diff 阶段被跳过，结果是一个空数组。空结果此前
  //    是终点沉默，现在至少能说出「有几条对不上」。
  const renumbered: Section = {
    experience: [{ id: 'regenerated-99', visible: true, summary: '<p>New</p>' }],
  };
  const diagnostics = { unmatchedItems: 0 };
  const changes = diffResumeToChanges(
    current,
    renumbered,
    'optimize',
    undefined,
    undefined,
    diagnostics
  );
  assert.equal(changes.length, 0);
  assert.equal(diagnostics.unmatchedItems, 1);

  // 正常配对时不该误报。
  const matched: Section = {
    experience: [{ id: 'exp-1', visible: true, summary: '<p>New</p>' }],
  };
  const clean = { unmatchedItems: 0 };
  assert.equal(
    diffResumeToChanges(current, matched, 'optimize', undefined, undefined, clean).length,
    1
  );
  assert.equal(clean.unmatchedItems, 0);

  // ② 接受一条指向不存在条目的改动：必须如实说没写进去。此前它原样返回 sections，
  //    而调用方无条件标记成功、移除卡片——用户点了接受，简历却一个字没变。
  const ghost = {
    target: {
      sectionKey: 'experience',
      itemId: 'does-not-exist',
      fieldKey: 'summary',
      kind: 'html',
      label: 'Ghost',
    },
    before: '<p>Old</p>',
    after: '<p>New</p>',
  } as Parameters<typeof applyChangeToSections>[1];

  const miss = applyChangeToSections(current, ghost);
  assert.equal(miss.applied, false);
  assert.deepEqual(miss.sections, current);

  const hit = applyChangeToSections(current, {
    ...ghost,
    target: { ...ghost.target, itemId: 'exp-1' },
  });
  assert.equal(hit.applied, true);
  assert.equal(
    (hit.sections.experience as Array<Record<string, unknown>>)[0].summary,
    '<p>New</p>'
  );
}

/** 改动到得了画布吗——两条曾经让它到不了的路。 */
function testCanvasReachability() {
  // ① 选区级 diff 的三个预览字段必须活着穿过投影。漏掉它们时「选中一句话让 AI 改」
  //    仍然工作，只是画布上整段变成红删绿增——功能没报错，只是悄悄退化成了整字段替换。
  const view = toPendingView({
    'sections.experience[exp-1].summary': {
      id: 'chg-1',
      action: 'rewrite',
      seed: 0,
      target: {
        sectionKey: 'experience',
        itemId: 'exp-1',
        fieldKey: 'summary',
        kind: 'html',
        label: 'Summary',
      },
      before: '<p>Whole paragraph.</p>',
      after: '<p>Whole paragraph, rewritten.</p>',
      previewBefore: 'one sentence',
      previewAfter: 'one better sentence',
      previewKind: 'text',
      rationale: 'tighter',
      status: 'pending',
    },
  } as Parameters<typeof toPendingView>[0]);

  const projected = view['sections.experience[exp-1].summary'];
  assert.equal(projected.previewBefore, 'one sentence');
  assert.equal(projected.previewAfter, 'one better sentence');
  assert.equal(projected.previewKind, 'text');

  // ② 分辨出「当前模板上没有就地落点」的改动。它们**不会被丢弃**——改动列表能列出、
  //    「全部接受」能应用，全程不需要 DOM；分辨出来只是为了告诉用户去哪看。丢掉它们等于
  //    把 company / position / date 这些字段重新变回「AI 改了但你永远看不到」。
  const mk = (fieldKey: string, isInsert = false) =>
    ({
      target: {
        sectionKey: 'experience',
        itemId: 'exp-1',
        fieldKey,
        kind: 'text',
        label: fieldKey,
      },
      before: 'a',
      after: 'b',
      rationale: '',
      isInsert,
    }) as Parameters<typeof partitionByAnchor>[0][number];

  const rendered = new Set(['sections.experience[exp-1].summary']);
  const { renderable, orphaned } = partitionByAnchor(
    [mk('summary'), mk('company'), mk('newField', true)],
    (path) => rendered.has(path)
  );

  assert.equal(renderable.length, 2); // summary 有锚点；新增条目由插槽接住
  assert.equal(orphaned.length, 1);
  assert.equal(orphaned[0].target.fieldKey, 'company');
  // 两边加起来必须是全部——一条都不能在分辨的过程中消失。
  assert.equal(renderable.length + orphaned.length, 3);
}

/** diff 覆盖面：白名单之外的字段此前永远不会出现在画布上。 */
function testDiffFieldCoverage() {
  const current: Section = {
    experience: [
      {
        id: 'exp-1',
        visible: true,
        company: '星河科技',
        position: '前端工程师',
        date: '2022.03 - 至今',
        summary: '<p>负责管理后台。</p>',
      },
    ],
  };

  // 只改公司名——此前 DIFF_FIELDS 里没有 company，这次改动在画布上**永远不出现**，
  // 用户看到的是「说改了、什么都没变」。
  const renamed: Section = {
    experience: [{ ...current.experience[0], company: '星河科技（北京）' }],
  };
  const changes = diffResumeToChanges(current, renamed, 'optimize');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].target.fieldKey, 'company');
  // 纯文本字段按值判成 text，不是一律当富文本。
  assert.equal(changes[0].target.kind, 'text');

  // 富文本仍判为 html。
  const rewritten: Section = {
    experience: [{ ...current.experience[0], summary: '<p>负责管理后台，支撑 12 条业务线。</p>' }],
  };
  const rich = diffResumeToChanges(current, rewritten, 'optimize');
  assert.equal(rich.length, 1);
  assert.equal(rich[0].target.kind, 'html');

  // id / visible 不该被当成内容改动——它们是结构，不是文案。
  const restructured: Section = {
    experience: [{ ...current.experience[0], visible: false }],
  };
  assert.equal(diffResumeToChanges(current, restructured, 'optimize').length, 0);

  // 一次改多个字段就是多张卡，每张各自可接受/丢弃。
  const multi: Section = {
    experience: [
      { ...current.experience[0], company: '星河科技（北京）', position: '高级前端工程师' },
    ],
  };
  assert.equal(diffResumeToChanges(current, multi, 'optimize').length, 2);
}

function testAfterAuthUrl() {
  // The middleware puts the original path in `redirect_url`. Nothing read it,
  // so a lapsed session on /billing/return?orderId=… came back to /dashboard
  // and the order id was gone — no polling, and no sync, which is the only
  // thing that captures a PayPal payment from the browser.
  assert.equal(
    afterAuthUrl('redirect_url=%2Fbilling%2Freturn%3ForderId%3Dcmxyz'),
    '/billing/return?orderId=cmxyz',
  );
  assert.equal(afterAuthUrl(''), '/dashboard');
  assert.equal(afterAuthUrl(null), '/dashboard');
  assert.equal(afterAuthUrl('foo=bar'), '/dashboard');

  // Same-origin paths only: a freshly signed-in session must not be bounced
  // off the site by a crafted link.
  assert.equal(afterAuthUrl('redirect_url=https%3A%2F%2Fevil.example'), '/dashboard');
  assert.equal(afterAuthUrl('redirect_url=%2F%2Fevil.example'), '/dashboard');
  assert.equal(afterAuthUrl('redirect_url=%2F%5Cevil.example'), '/dashboard');
  assert.equal(afterAuthUrl('redirect_url=javascript%3Aalert(1)'), '/dashboard');

  // The URL parser strips tab/LF/CR before resolving, so a prefix check on
  // '//' is not enough — these resolved to https://evil.example.
  assert.equal(afterAuthUrl('redirect_url=%2F%09%2F%2Fevil.example'), '/dashboard');
  assert.equal(afterAuthUrl('redirect_url=%2F%0A%2F%2Fevil.example'), '/dashboard');
  assert.equal(afterAuthUrl('redirect_url=%2F%0D%2F%2Fevil.example'), '/dashboard');
}

function testSectionOwnership() {
  // `profiles` ships in defaultResume and templates render it, so offering
  // delete on it destroyed data that normalize cannot bring back.
  for (const builtin of [
    'basics', 'experience', 'education', 'projects',
    'skills', 'languages', 'certificates', 'profiles',
  ]) {
    assert.equal(isCustomSection(builtin), false, `${builtin} must not be deletable`);
  }
  assert.equal(isCustomSection('personalStrengths'), true);

  // A custom title must never mint a reserved key.
  assert.notEqual(customSectionKey('Basics', ['skills']), 'basics');
  assert.notEqual(customSectionKey('Profiles', ['skills']), 'profiles');

  // The icon has to survive normalize — it runs on every drag and every write.
  const withIcon = normalizeResumeSectionOrder(
    [{ key: 'personalStrengths', label: '个人优势', icon: 'trophy' }],
    { personalStrengths: [] },
  );
  assert.equal(withIcon.find((s) => s.key === 'personalStrengths')?.icon, 'trophy');
}

function testSectionOrderCoercion() {
  // A model told the legacy contract writes bare strings. Nothing validated it,
  // so `.map(s => s.key)` gave undefined for every entry and the whole draft
  // rendered blank — correct-looking JSON, no error anywhere.
  assert.deepEqual(
    coerceSectionOrder(['experience', 'projects']),
    [
      { key: 'experience', label: 'sections.experience' },
      { key: 'projects', label: 'sections.projects' },
    ],
  );

  // Already-correct input passes through untouched, icon and all.
  const proper = [{ key: 'skills', label: '专业技能', icon: 'wrench' }];
  assert.deepEqual(coerceSectionOrder(proper), proper);

  // Junk is dropped rather than turned into keyless entries.
  assert.deepEqual(coerceSectionOrder(['', '  ', null, 42, {}, { key: '' }]), []);
  assert.deepEqual(coerceSectionOrder(undefined), []);
  assert.deepEqual(coerceSectionOrder('experience'), []);

  // Coercion must not complete the list: a draft preview shows what the model
  // wrote, not every default section as an empty heading.
  assert.equal(coerceSectionOrder(['experience']).length, 1);

  // But normalize (the editor path) still completes it, and keeps the order the
  // strings gave instead of falling back to the default sequence.
  const normalized = normalizeResumeSectionOrder(
    ['projects', 'experience'] as unknown as SectionOrder[],
    { projects: [], experience: [] },
  );
  const keys = normalized.map((s) => s.key);
  assert.equal(keys[0], 'basics');
  assert.ok(keys.indexOf('projects') < keys.indexOf('experience'), 'model order lost');
  assert.ok(keys.includes('skills'), 'built-in section missing after normalize');
}

/**
 * 错误契约（Core ADR-0018）：码是后端下发的，文案是前端的。
 *
 * 这条覆盖测试是那条分界能成立的前提——后端加了新码而前端没写文案，就在这里红。没有它，
 * 「文案归前端」只是一句口号，实际会退化成用户在屏幕上读到一个标识符。
 */
function testErrorCopyCoverage() {
  for (const code of [...APP_ERROR_CODES, 'unknown']) {
    for (const [lang, dict] of [['zh', zhCopy], ['en', enCopy]] as const) {
      const copy = (dict.errors as Record<string, unknown>)[code];
      assert.equal(
        typeof copy,
        'string',
        `${lang} 缺少 errors.${code} 的文案`,
      );
      assert.ok((copy as string).trim().length > 0, `${lang} errors.${code} 是空串`);
    }
  }

  // 两侧必须同构：只补一种语言等于给另一种语言的用户留了一个标识符。
  assert.deepEqual(
    Object.keys(zhCopy.errors).sort(),
    Object.keys(enCopy.errors).sort(),
    'zh / en 的 errors 键不同构',
  );
}

/**
 * 归一化：契约的地基。重点不是「新后端发了码」，而是**上游什么都没发时**——老后端还在
 * 线上的那几周，前端手里只有一个状态码。
 */
function testErrorNormalize() {
  // 本次修复的靶子：额度用完必须是 quota_exceeded，绝不能被读成 rate_limited。
  const quota = fromErrorBody(
    429,
    {
      code: 429,
      message: 'quota_exhausted',
      errorCode: 'quota_exceeded',
      subCode: 'daily_cap',
      params: { period: 'daily', resetAt: '2026-08-13T00:00:00Z' },
      requestId: 'req-1',
      retryable: false,
    },
    'bff',
  );
  assert.equal(quota.errorCode, 'quota_exceeded');
  assert.notEqual(quota.errorCode, 'rate_limited');
  assert.equal(quota.params?.period, 'daily');
  assert.equal(quota.requestId, 'req-1');
  assert.equal(quota.retryable, false);
  assert.equal(opensBillingGate(quota.errorCode), true);

  // 老后端：只有状态码。降级到今天的粒度，不会更差。
  const legacyStatus = fromErrorBody(429, { code: 429, message: '' }, 'bff');
  assert.equal(legacyStatus.errorCode, 'rate_limited');
  assert.equal(legacyStatus.retryable, true);

  // 老后端 + 存量字符串码：那几周里这就是全部的可用信息。
  const legacyCode = fromErrorBody(429, { code: 'quota_exhausted' }, 'bff');
  assert.equal(legacyCode.errorCode, 'quota_exceeded');
  assert.equal(legacyCode.subCode, 'quota_exhausted');

  // 畸形体：不能因此再抛一个错。
  assert.equal(fromErrorBody(500, undefined, 'bff').errorCode, 'internal_error');
  assert.equal(fromErrorBody(500, 'not json', 'bff').errorCode, 'internal_error');
  assert.equal(fromErrorBody(undefined, {}, 'local').errorCode, 'unknown');

  // 老 BFF 那句 "Backend request failed with status 429" 绝不能当文案渲染。
  const bffNoise = fromErrorBody(
    429,
    { error: 'Backend request failed with status 429' },
    'bff',
  );
  assert.equal(bffNoise.publicMessage, undefined);

  // message 只是机器码时同样不算文案。
  assert.equal(
    fromErrorBody(429, { code: 'quota_exhausted', message: 'quota_exhausted' }, 'bff')
      .publicMessage,
    undefined,
  );

  // 网络断了是「依赖够不着」，不是「我们有 bug」。
  const network = fromThrown(new TypeError('Failed to fetch'));
  assert.equal(network.errorCode, 'upstream_unavailable');
  assert.equal(network.retryable, true);

  // 用户点了停止：不是故障，静默丢弃。
  const aborted = fromThrown(Object.assign(new Error('x'), { name: 'AbortError' }));
  assert.equal(isAborted(aborted), true);
  assert.equal(presentAppError(aborted), null);

  // SSE 帧：payload.errorCode 优先，老的 error 字段仍认。
  assert.equal(
    fromSseEvent({ error: 'quota_exceeded', payload: { code: 'quota_exceeded' } })
      .errorCode,
    'quota_exceeded',
  );
  assert.equal(
    fromSseEvent({ error: 'agent_run_failed', payload: {} }).errorCode,
    'internal_error',
  );
}

/** 文案：本地化的码文案永远当标题，服务端那句只能是补充行。 */
function testErrorCopy() {
  const t = (key: string, options?: Record<string, unknown>) => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (acc, part) =>
          typeof acc === 'object' && acc !== null
            ? (acc as Record<string, unknown>)[part]
            : undefined,
        zhCopy,
      );
    if (typeof value !== 'string') {
      return (options?.defaultValue as string | undefined) ?? key;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(options?.[name] ?? ''),
    );
  };

  const copy = appErrorCopy(
    {
      errorCode: 'content_rejected',
      retryable: false,
      source: 'sse',
      publicMessage: 'This PDF looks like a scan — we could not read any text.',
    },
    t,
  );
  // 屏幕上永远不会只剩一句外语：标题一定是本地语言。
  assert.equal(copy.title, zhCopy.errors.content_rejected);
  assert.equal(copy.detail, 'This PDF looks like a scan — we could not read any text.');

  // 认不出的码退到通用兜底，而不是把标识符渲染出来。
  const unknown = appErrorCopy(
    { errorCode: 'unknown', retryable: false, source: 'http' },
    t,
  );
  assert.equal(unknown.title, zhCopy.errors.unknown);
  assert.ok(!unknown.title.includes('errors.'));
}

async function main() {
  await testAiSessionStore();
  testImportResumeValidation();
  testUtilityFunctions();
  testMcpAccessHelpers();
  testAiLib();
  testAiFailuresAreVisible();
  testCanvasReachability();
  testDiffFieldCoverage();
  testAfterAuthUrl();
  testImportedItemIds();
  testResumeMigrations();
  testCustomSections();
  testSectionOwnership();
  testSectionOrderCoercion();
  testErrorCopyCoverage();
  testErrorNormalize();
  testErrorCopy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
