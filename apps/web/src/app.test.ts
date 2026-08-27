import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilterTable, RecordsTable } from "@magic-resume/genui/beautiful";
import type {
  FilterTableProps,
  RecordsTableProps,
} from "@magic-resume/genui/beautiful";
import { WidgetHost } from "@magic-resume/genui";
import zhCopy from "@/locales/zh/translation.json";
import enCopy from "@/locales/en/translation.json";
import {
  fromErrorBody,
  fromSseEvent,
  fromThrown,
  isAborted,
} from "@/lib/errors/normalize";
import { appErrorCopy } from "@/lib/errors/message";
import {
  settleWidgetInMessages,
  upsertWidgetInMessages,
} from "@/app/dashboard/edit/_components/ai/lib/widgetPlacement";
import { presentAppError } from "@/lib/errors/present";
import { APP_ERROR_CODES, opensBillingGate } from "@/lib/errors/types";
import { projectUpstreamError } from "@/app/api/chat-agent/errorProjection";
import TasksCard, {
  formatElapsedDuration,
  isPlanFulfilled,
  isRetirablePlan,
  segmentsOf,
} from "@/app/dashboard/edit/_components/ai/conversation/TasksCard";
import { normalizeMarkdownSource } from "@/app/dashboard/edit/_components/ai/conversation/markdownSource";
import {
  AGENT_TOOL_VERBS,
  toToolChipRows,
} from "@/app/dashboard/edit/_components/ai/conversation/toolTrace";
import Markdown from "@/app/dashboard/edit/_components/ai/conversation/Markdown";
import {
  citationSourcesFromWebSearchToolResult,
  linkCitationMarkers,
  mergeCitationSources,
  normalizeCitationSources,
  siteFaviconUrl,
  visibleCitationSources,
} from "@/app/dashboard/edit/_components/ai/conversation/citationSources";
import {
  planInterrupt,
  openDecisions,
  fillDecision,
} from "@/app/dashboard/edit/_components/ai/lib/interruptPlan";
import {
  createStreamingTextBuffer,
  STREAM_RENDER_INTERVAL_MS,
} from "@/app/dashboard/edit/_components/ai/lib/streamingBuffer";
import {
  FORM_DEFS,
  WIDGETS,
  askChoiceKind,
  normalizeApplicationTrackerProps,
  normalizeResearchWidgetProps,
  requestFormKind,
} from "@/app/dashboard/edit/_components/ai/widgets/registry";
import type {
  ChatMessage,
  PlanTodo,
  TodoSegment,
} from "@/app/dashboard/edit/_components/ai/types";
import { ZodError } from "zod";
import {
  applyChangeToSections,
  buildSelectionChange,
  buildSelectionPreview,
  type EditResultLike,
} from "@/app/dashboard/edit/_components/ai/lib/changeModel";
import { diffResumeToChanges } from "@/app/dashboard/edit/_components/ai/lib/diffResume";
import { analysisImprovementActions } from "@/app/dashboard/edit/_components/ai/lib/analysisIssues";
import {
  partitionByAnchor,
  toPendingView,
} from "@/app/dashboard/edit/_components/ai/lib/pendingView";
import {
  pathOf,
  type EditableTarget,
} from "@/app/dashboard/edit/_components/ai/lib/editableCanvas";
import {
  resolveResumePatchBatch,
  resolveResumePatchEvent,
} from "@/app/dashboard/edit/_components/ai/lib/resumePatch";
import {
  getApiErrorMessage,
  getMcpApiUrl,
  normalizeCloudResumes,
  shellQuote,
} from "@/lib/settings/mcpAccess";
import { afterAuthUrl } from "@/components/auth/afterAuthUrl";
import { migrateResume } from "@/lib/utils/resumeMigrations";
import {
  coerceSectionOrder,
  customSectionKey,
  isCustomSection,
  normalizeResumeSectionOrder,
} from "@/lib/utils/resumeSectionOrder";
import type { SectionOrder } from "@/types/frontend/resume";
import { shallowEqualArray } from "@/lib/utils/array";
import { hexToRgb, rgbToHex } from "@/lib/utils/color";
import { parseCssPixelValue } from "@/lib/utils/css";
import {
  formatCommentDate,
  formatCompactDateTime,
  formatShortDateTime,
  getCountdownTimeLeft,
} from "@/lib/utils/dateTime";
import { getFileSizeBucket } from "@/lib/utils/fileSize";
import { generateShortHash } from "@/lib/utils/hash";
import { getInitials } from "@/lib/utils/userDisplay";
import {
  formatResumeImportValidationError,
  validateAndNormalizeImportedResume,
} from "@/lib/validation/importResume";
import {
  AI_SESSION_TTL_MS,
  createAiSessionStore,
  getAiSessionStorageKey,
  type AiSessionSnapshot,
} from "@/store/useAiSessionStore";
import type { Resume, Section } from "@/types/frontend/resume";
import { mergeInterviewTurns } from "@/app/dashboard/interview/_components/mergeTurns";
import {
  CHARS_PER_SECOND,
  nextShownChars,
  nextStage,
} from "@/app/dashboard/interview/_components/useCaptionPacing";
import { packTrajectoryRanges } from "@/app/dashboard/edit/_components/ai/conversation/trajectory";

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

const baseSession = (
  overrides: Partial<AiSessionSnapshot> = {},
): Partial<AiSessionSnapshot> => ({
  started: true,
  sessionId: "session-a",
  sessionUsed: true,
  messages: [
    { id: "m1", role: "user", content: "帮我优化简历" },
    { id: "m2", role: "assistant", content: "当然可以。" },
  ],
  ...overrides,
});

/** 记录投递了什么。默认端口会去打网络，单测里必须换掉。 */
class RecordingSync {
  pushed: Array<{ conversationId: string; seq: number; role: string }> = [];
  push(input: { conversationId: string; seq: number; role: string }): void {
    this.pushed.push(input);
  }
}

const oldSentence =
  "Refactored critical resource-monitoring dashboards using Angular and RxJS, reducing memory leaks by 25% and improving data refresh intervals for massive clusters.";
const optimizedSentence =
  "Refactored resource-monitoring dashboards with Angular and RxJS, cutting memory leaks by 25% and reducing data refresh latency across large-scale clusters.";
const rewrittenSentence =
  "Redesigned critical resource-monitoring dashboards with Angular and RxJS, cutting memory leaks by 25% and accelerating data refresh rates for massive clusters.";

const beforeSummary = [
  "<p>Google Cloud Console UI Optimization</p>",
  "<ul>",
  `<li>${oldSentence}</li>`,
  "<li>Developed a specialized Web Worker layer to handle multi-threaded telemetry data processing, preventing main-thread blocking during peak load.</li>",
  "</ul>",
].join("");

const rewrittenSummary = [
  "<p>Google Cloud Console UI Optimization</p>",
  "<ul>",
  `<li>${rewrittenSentence}</li>`,
  "<li>Developed a specialized Web Worker layer to handle multi-threaded telemetry data processing, preventing main-thread blocking during peak load.</li>",
  "</ul>",
].join("");

const targetSelection = {
  path: "sections.experience[google].summary",
  selectionText: oldSentence,
};

const resume: Resume = {
  id: "resume-1",
  name: "Kairo Resume",
  updatedAt: 1,
  info: {
    fullName: "Kairo Chen",
    headline: "",
    email: "",
    phoneNumber: "",
    address: "",
    website: "",
    avatar: "",
  },
  sections: {
    experience: [
      {
        id: "google",
        visible: true,
        company: "Google",
        summary: beforeSummary,
      },
      {
        id: "bytedance",
        visible: true,
        company: "ByteDance",
        summary: "<p>Unchanged</p>",
      },
    ],
  },
  sectionOrder: [{ key: "experience", label: "Experience" }],
  template: "classic",
  themeColor: "#f97316",
  typography: "inter",
};

async function testAiSessionStore() {
  {
    const now = 1_000;
    const db = new MemoryDb();
    const store = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => "fresh-session",
      persistDelayMs: 0,
      sync: new RecordingSync(),
    });

    await store.getState().patchSession("resume-a", baseSession());
    await store.getState().patchSession("resume-a", {
      analysis: {
        overall_score: 83,
        category_averages: { impact: 80 },
        peer_analysis: {
          persona: "peer_developer",
          score: 82,
          categories_scores: { impact: 80 },
          strengths: ["技术栈扎实"],
          weaknesses: ["结果量化不足"],
          suggestions: ["补充性能数据"],
        },
        leader_analysis: {
          persona: "tech_lead",
          score: 84,
          categories_scores: { impact: 84 },
          strengths: ["项目复杂度不错"],
          weaknesses: ["业务影响表达弱"],
          suggestions: ["突出负责范围"],
        },
        hrbp_analysis: {
          persona: "hrbp",
          score: 83,
          categories_scores: { impact: 82 },
          strengths: ["经历完整"],
          weaknesses: ["关键词覆盖不足"],
          suggestions: ["补充岗位关键词"],
        },
      },
    });
    await store.getState().flushSession("resume-a");

    const reloaded = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => "unused",
      persistDelayMs: 0,
      sync: new RecordingSync(),
    });
    const session = await reloaded.getState().loadSession("resume-a");

    assert.equal(session.sessionId, "session-a");
    assert.equal(session.sessionUsed, true);
    assert.equal(session.messages.length, 2);
    assert.equal(session.messages[0].content, "帮我优化简历");
    assert.equal(session.analysis?.overall_score, 83);
  }

  {
    const db = new MemoryDb();
    const store = createAiSessionStore({
      db,
      now: () => 2_000,
      idFactory: () => "new-session",
      persistDelayMs: 0,
      sync: new RecordingSync(),
    });

    await store
      .getState()
      .patchSession("resume-a", baseSession({ sessionId: "session-a" }));
    await store
      .getState()
      .patchSession(
        "resume-b",
        baseSession({ sessionId: "session-b", messages: [] }),
      );
    await store.getState().flushSession("resume-a");
    await store.getState().flushSession("resume-b");

    const a = await store.getState().loadSession("resume-a");
    const b = await store.getState().loadSession("resume-b");

    assert.equal(a.sessionId, "session-a");
    assert.equal(a.messages.length, 2);
    assert.equal(b.sessionId, "session-b");
    assert.equal(b.messages.length, 0);
  }

  {
    const now = 10_000 + AI_SESSION_TTL_MS;
    const db = new MemoryDb();
    await db.setItem(getAiSessionStorageKey("resume-a"), {
      ...baseSession(),
      updatedAt: 9_999,
    });
    const store = createAiSessionStore({
      db,
      now: () => now,
      idFactory: () => "fresh-after-expiry",
      persistDelayMs: 0,
      sync: new RecordingSync(),
    });

    const session = await store.getState().loadSession("resume-a");

    assert.equal(session.sessionId, "fresh-after-expiry");
    assert.equal(session.started, false);
    assert.equal(session.messages.length, 0);
    assert.equal(db.items.has(getAiSessionStorageKey("resume-a")), false);
  }

  {
    const db = new MemoryDb();
    const ids = ["first-session", "second-session"];
    const store = createAiSessionStore({
      db,
      now: () => 3_000,
      idFactory: () => ids.shift() ?? "fallback-session",
      persistDelayMs: 0,
      sync: new RecordingSync(),
    });

    await store.getState().patchSession("resume-a", baseSession());
    const reset = store.getState().resetSession("resume-a");
    await store.getState().flushSession("resume-a");

    assert.equal(reset.sessionId, "second-session");
    assert.equal(reset.sessionUsed, false);
    assert.equal(reset.started, false);
    assert.equal(reset.messages.length, 0);
    assert.equal(reset.analysis, null);
  }

  // 投递边界：seq 必须是消息下标、同一条不重复投、后续新增接着上一次投。
  // 投重了服务端会覆盖同一行（无害），但**投漏了就是历史里少一条消息**，且没人会发现。
  {
    const sync = new RecordingSync();
    const store = createAiSessionStore({
      db: new MemoryDb(),
      now: () => 4_000,
      idFactory: () => "seal-session",
      persistDelayMs: 0,
      sync,
    });

    store.getState().patchSession("resume-a", baseSession());
    store.getState().sealSession("resume-a");
    assert.deepEqual(
      sync.pushed.map((m) => [m.conversationId, m.seq, m.role]),
      [
        ["session-a", 0, "user"],
        ["session-a", 1, "assistant"],
      ],
    );

    // 再收一次不该重投——否则每轮都会把整条时间线重发一遍。
    store.getState().sealSession("resume-a");
    assert.equal(sync.pushed.length, 2);

    // 新增的消息接着上一次的 seq。
    store.getState().patchSession("resume-a", {
      messages: [
        ...(baseSession().messages ?? []),
        { id: "m3", role: "user", content: "再改改" },
      ],
    });
    store.getState().sealSession("resume-a");
    assert.equal(sync.pushed.length, 3);
    assert.equal(sync.pushed[2].seq, 2);

    // 换新对话前必须先收干净：换完 sessionId 就再也认不出这些消息属于谁了。
    store.getState().patchSession("resume-a", {
      messages: [
        ...(baseSession().messages ?? []),
        { id: "m3", role: "user", content: "再改改" },
        { id: "m4", role: "assistant", content: "好的。" },
      ],
    });
    store.getState().resetSession("resume-a");
    assert.equal(sync.pushed.length, 4);
    assert.equal(sync.pushed[3].conversationId, "session-a");

    // 新会话从 seq 0 重新开始，不接着旧的数。
    store.getState().patchSession("resume-a", {
      messages: [{ id: "n1", role: "user", content: "新的一场" }],
    });
    store.getState().sealSession("resume-a");
    assert.equal(sync.pushed[4].seq, 0);
    assert.equal(sync.pushed[4].conversationId, "seal-session");
  }
}

function testImportResumeValidation() {
  const normalized = validateAndNormalizeImportedResume({
    name: "Imported Resume",
    isPublic: true,
    shareId: "public-share",
    shareRole: "VIEWER",
    info: {
      fullName: "Ada Lovelace",
    },
    sections: {
      experience: [
        {
          id: "exp-1",
          company: "Analytical Engines",
          extraBackendField: "kept",
        },
      ],
      customSection: [
        {
          id: "custom-1",
          title: "Notes",
        },
      ],
    },
    sectionOrder: [{ key: "experience", label: "Experience" }],
  });

  assert.equal(normalized.isPublic, undefined);
  assert.equal(normalized.shareId, undefined);
  assert.equal(normalized.shareRole, undefined);
  assert.equal(normalized.info.fullName, "Ada Lovelace");
  assert.equal(normalized.info.email, "");
  assert.equal(normalized.sections.experience[0].visible, true);
  assert.equal(normalized.sections.experience[0].extraBackendField, "kept");
  assert.deepEqual(normalized.sections.education, []);
  // A custom section survives with its content. The id is reissued — imported
  // ids are whatever the source said, and the app mints its own with nanoid.
  const customItems = normalized.sections.customSection as {
    id: string;
    title: string;
  }[];
  assert.equal(customItems.length, 1);
  assert.equal(customItems[0].title, "Notes");
  assert.match(customItems[0].id, /^[A-Za-z0-9_-]{21}$/);
  assert.deepEqual(
    normalized.sectionOrder.map(({ key }) => key),
    [
      "basics",
      "experience",
      "projects",
      "education",
      "skills",
      "languages",
      "certificates",
      "customSection",
    ],
  );

  const repairedEmptyOrder = validateAndNormalizeImportedResume({
    info: {},
    sections: {},
    sectionOrder: [],
  });
  assert.deepEqual(
    repairedEmptyOrder.sectionOrder.map(({ key }) => key),
    [
      "basics",
      "projects",
      "education",
      "skills",
      "languages",
      "certificates",
      "experience",
    ],
  );

  const message = formatResumeImportValidationError(
    new ZodError([
      {
        code: "custom",
        path: ["sectionOrder"],
        message: "Array must contain at least 1 element(s)",
      },
    ]),
  );

  assert.equal(
    message,
    "Invalid resume format: sectionOrder: Array must contain at least 1 element(s)",
  );
}

function testUtilityFunctions() {
  const first = ["summary", "experience"];
  assert.equal(shallowEqualArray(first, first), true);
  assert.equal(
    shallowEqualArray(["summary", "experience"], ["summary", "experience"]),
    true,
  );
  assert.equal(
    shallowEqualArray(["summary"], ["summary", "experience"]),
    false,
  );
  assert.equal(
    shallowEqualArray(["experience", "summary"], ["summary", "experience"]),
    false,
  );

  assert.deepEqual(hexToRgb("#38bdf8"), { r: 56, g: 189, b: 248 });
  assert.deepEqual(hexToRgb("#abc"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb(" #abc "), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb(" 38BDF8 "), { r: 56, g: 189, b: 248 });
  assert.equal(hexToRgb("#abcd"), null);
  assert.equal(hexToRgb("not-a-color"), null);
  assert.equal(rgbToHex(56, 189, 248), "#38bdf8");
  assert.equal(rgbToHex(255.4, -4, 300), "#ff00ff");

  assert.equal(parseCssPixelValue("360px"), 360);
  assert.equal(parseCssPixelValue(" 16px "), 16);
  assert.equal(parseCssPixelValue("12.5px"), 12);
  assert.equal(parseCssPixelValue("auto"), 0);
  assert.equal(parseCssPixelValue(""), 0);

  const t = (key: string) =>
    key === "sharedPage.comments.justNow" ? "Just now translated" : key;
  assert.equal(formatCommentDate("", t), "Just now translated");
  assert.equal(formatCommentDate("Just now", t), "Just now translated");
  assert.equal(formatCommentDate("not-a-date", t), "not-a-date");
  assert.equal(
    formatShortDateTime(new Date("2026-07-03T08:09:00Z"), "en-US", "UTC"),
    "Jul 3, 08:09 AM",
  );
  assert.equal(formatCompactDateTime(undefined), "");
  assert.equal(
    formatCompactDateTime(Date.UTC(2026, 6, 3, 8, 9), "zh-CN", "UTC"),
    "7/3 08:09",
  );
  assert.deepEqual(
    getCountdownTimeLeft((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000, 0),
    {
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    },
  );
  assert.deepEqual(getCountdownTimeLeft(1000, 5000), {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  assert.equal(getFileSizeBucket(0), "small");
  assert.equal(getFileSizeBucket(512 * 1024 - 1), "small");
  assert.equal(getFileSizeBucket(512 * 1024), "medium");
  assert.equal(getFileSizeBucket(2 * 1024 * 1024 - 1), "medium");
  assert.equal(getFileSizeBucket(2 * 1024 * 1024), "large");

  assert.equal(
    generateShortHash("version-123"),
    generateShortHash("version-123"),
  );
  assert.match(generateShortHash("version-123"), /^[0-9a-f]{7}$/);
  assert.notEqual(
    generateShortHash("version-123"),
    generateShortHash("completely-different-version"),
  );

  assert.equal(getInitials("Ada Lovelace", null), "AL");
  assert.equal(getInitials("  Grace   Hopper  ", null), "GH");
  assert.equal(getInitials("Kai", null), "KA");
  assert.equal(getInitials(null, "user@example.com"), "US");
  assert.equal(getInitials(null, null), "");
}

function testMcpAccessHelpers() {
  assert.equal(getMcpApiUrl("https://example.com"), "https://example.com/api");
  assert.equal(
    getMcpApiUrl("https://example.com/api/"),
    "https://example.com/api",
  );
  assert.equal(shellQuote("abc'def"), "'abc'\\''def'");
  assert.deepEqual(normalizeCloudResumes([{ id: "1", name: "Resume A" }]), [
    { id: "1", title: "Resume A" },
  ]);
  assert.deepEqual(
    normalizeCloudResumes({ data: { data: [{ id: "2", title: "Resume B" }] } }),
    [{ id: "2", title: "Resume B" }],
  );
  assert.deepEqual(normalizeCloudResumes([{ title: "missing id" }]), []);
  assert.equal(
    getApiErrorMessage({
      isAxiosError: true,
      response: { data: { message: "Nope" } },
    }),
    "Nope",
  );
  assert.equal(getApiErrorMessage(new Error("plain")), null);
}

function testAiLib() {
  const preview = buildSelectionPreview(
    beforeSummary,
    rewrittenSummary,
    oldSentence,
  );
  assert.deepEqual(preview, {
    previewBefore: oldSentence,
    previewAfter: rewrittenSentence,
    previewKind: "text",
  });

  const target: EditableTarget = {
    sectionKey: "experience",
    itemId: "google",
    fieldKey: "summary",
    kind: "html",
    label: "Selected segment",
  };

  const result: EditResultLike = {
    after: rewrittenSummary,
    rationale: "More active wording.",
  };

  const change = buildSelectionChange(
    target,
    beforeSummary,
    oldSentence,
    "free",
    result,
    {
      freeText: "Make it stronger",
    },
  );

  assert.equal(change.before, beforeSummary);
  assert.equal(change.after, rewrittenSummary);
  assert.equal(change.previewBefore, oldSentence);
  assert.equal(change.previewAfter, rewrittenSentence);
  assert.equal(change.previewKind, "text");

  const current: Section = {
    experience: [
      {
        id: "google",
        visible: true,
        company: "Google",
        summary: beforeSummary,
      },
      {
        id: "bytedance",
        visible: true,
        company: "ByteDance",
        summary: "<p>Unchanged</p>",
      },
    ],
  };

  const proposed: Section = {
    experience: [
      {
        id: "google",
        visible: true,
        company: "Google",
        summary: rewrittenSummary,
      },
      {
        id: "bytedance",
        visible: true,
        company: "ByteDance",
        summary: "<p>Unchanged</p>",
      },
    ],
  };

  const changes = diffResumeToChanges(
    current,
    proposed,
    "optimize",
    undefined,
    targetSelection,
  );

  assert.equal(changes.length, 1);
  assert.equal(pathOf(changes[0].target), targetSelection.path);
  assert.equal(changes[0].before, beforeSummary);
  assert.equal(changes[0].after, rewrittenSummary);
  assert.equal(changes[0].previewBefore, oldSentence);
  assert.equal(changes[0].previewAfter, rewrittenSentence);
  assert.equal(changes[0].previewKind, "text");

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
  assert.equal(
    resolved.resume.sections.experience[1].summary,
    "<p>Unchanged</p>",
  );
  assert.deepEqual(resolved.targetedSelection, targetSelection);

  const fallback = resolveResumePatchEvent(resume, {
    oldString: oldSentence,
    newString: optimizedSentence,
  });
  assert.ok(fallback);
  assert.deepEqual(fallback.targetedSelection, targetSelection);

  const untouched = resolveResumePatchEvent(resume, {
    oldString: "missing",
    newString: "replacement",
  });
  assert.equal(untouched, null);

  const chatPatchBatch = resolveResumePatchBatch(resume, {
    oldString: oldSentence,
    newString: optimizedSentence,
  });
  assert.ok(chatPatchBatch);
  assert.equal(chatPatchBatch.kind, "optimize");
  assert.equal(
    chatPatchBatch.proposedSections.experience[0].summary,
    beforeSummary.replace(oldSentence, optimizedSentence),
  );
  assert.deepEqual(chatPatchBatch.targetedSelection, targetSelection);

  const translatePatchBatch = resolveResumePatchBatch(
    resume,
    { oldString: oldSentence, newString: optimizedSentence },
    { kind: "translate", lang: "English" },
  );
  assert.ok(translatePatchBatch);
  assert.equal(translatePatchBatch.kind, "translate");
  assert.equal(translatePatchBatch.lang, "English");
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
      experience: [{ id: "exp-1" }, { id: "exp-1" }],
      skills: [{ id: "skill-1" }],
      personalStrengths: [{ id: "skill-1" }],
    },
    sectionOrder: [{ key: "experience", label: "Experience" }],
  });

  const ids = Object.values(normalized.sections).flatMap((items) =>
    (items as { id: string }[]).map((i) => i.id),
  );
  assert.equal(ids.length, 4);
  // Same shape the app mints for itself (nanoid, 21 URL-safe chars).
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{21}$/);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  // A custom section survives the reissue, keys and all.
  assert.ok(normalized.sections.personalStrengths);
}

function testResumeMigrations() {
  // `summary` is the only rich-text field the editor edits and twelve of the
  // thirteen templates render. Prose stranded in `description` by an older
  // import is stored, invisible and un-editable.
  const migrated = migrateResume({
    id: "r1",
    sectionOrder: [{ key: "basics", label: "Basics" }],
    sections: {
      skills: [
        { id: "a", visible: true, description: "<p>正文</p>" },
        { id: "b", visible: true, summary: "<p>已有</p>", description: "次要" },
        {
          id: "c",
          visible: true,
          summary: "   ",
          description: "<p>空白也算空</p>",
        },
      ],
    },
  } as never);

  assert.equal(migrated.sections.skills[0].summary, "<p>正文</p>");
  // Never overwrite a summary the resume already had.
  assert.equal(migrated.sections.skills[1].summary, "<p>已有</p>");
  assert.equal(migrated.sections.skills[2].summary, "<p>空白也算空</p>");
  // Left in place — product-ops-focus reads it.
  assert.equal(migrated.sections.skills[0].description, "<p>正文</p>");

  // `basics` drives the editor's first form; a resume written before it existed
  // opens without the name/contact fields.
  const noBasics = migrateResume({
    id: "r2",
    sectionOrder: [{ key: "experience", label: "Experience" }],
    sections: {},
  } as never);
  assert.equal(noBasics.sectionOrder[0].key, "basics");

  // Nothing to repair → the same object back, so callers can skip the write
  // and avoid a spurious "modified" sync status.
  const clean = {
    id: "r3",
    sectionOrder: [{ key: "basics", label: "Basics" }],
    sections: { skills: [{ id: "a", visible: true, summary: "<p>x</p>" }] },
  } as never;
  assert.equal(migrateResume(clean), clean);
}

function testCustomSections() {
  // Only sections the app did not define can be renamed or deleted. A built-in's
  // label is an i18n key (`sections.skills`), so renaming one would swap a
  // translated string for a literal and break every other language; deleting one
  // would remove a form the editor expects to exist.
  for (const builtin of [
    "basics",
    "experience",
    "education",
    "projects",
    "skills",
    "languages",
    "certificates",
  ]) {
    assert.equal(
      isCustomSection(builtin),
      false,
      `${builtin} must be protected`,
    );
  }
  assert.equal(isCustomSection("personalStrengths"), true);
  assert.equal(isCustomSection("个人优势"), true);

  // Keys are derived from the title for readable JSON, but never trusted to be
  // unique or even expressible in ascii.
  assert.equal(
    customSectionKey("Personal Highlights", []),
    "personal-highlights",
  );
  assert.equal(customSectionKey("  Awards!  ", []), "awards");
  // A Chinese title slugs to nothing — it still needs a key.
  assert.equal(customSectionKey("个人优势", []), "section");
  assert.equal(customSectionKey("个人优势", ["section"]), "section-2");
  assert.equal(customSectionKey("Awards", ["awards", "awards-2"]), "awards-3");

  // A custom section survives order normalisation with its label intact, which
  // is what the editor and the renderer both title it from.
  const order = normalizeResumeSectionOrder(
    [{ key: "personalStrengths", label: "个人优势" }],
    {
      personalStrengths: [],
      skills: [],
    },
  );
  assert.deepEqual(
    order.find((s) => s.key === "personalStrengths"),
    { key: "personalStrengths", label: "个人优势" },
  );
  // …and the built-ins are still all present, so no form disappears.
  for (const builtin of ["basics", "skills", "experience"]) {
    assert.ok(
      order.some((s) => s.key === builtin),
      `${builtin} missing from order`,
    );
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
    experience: [{ id: "exp-1", visible: true, summary: "<p>Old</p>" }],
  };

  // ① agent 重建了 id：每一条改动都在 diff 阶段被跳过，结果是一个空数组。空结果此前
  //    是终点沉默，现在至少能说出「有几条对不上」。
  const renumbered: Section = {
    experience: [
      { id: "regenerated-99", visible: true, summary: "<p>New</p>" },
    ],
  };
  const diagnostics = { unmatchedItems: 0 };
  const changes = diffResumeToChanges(
    current,
    renumbered,
    "optimize",
    undefined,
    undefined,
    diagnostics,
  );
  assert.equal(changes.length, 0);
  assert.equal(diagnostics.unmatchedItems, 1);

  // 正常配对时不该误报。
  const matched: Section = {
    experience: [{ id: "exp-1", visible: true, summary: "<p>New</p>" }],
  };
  const clean = { unmatchedItems: 0 };
  assert.equal(
    diffResumeToChanges(
      current,
      matched,
      "optimize",
      undefined,
      undefined,
      clean,
    ).length,
    1,
  );
  assert.equal(clean.unmatchedItems, 0);

  // ② 接受一条指向不存在条目的改动：必须如实说没写进去。此前它原样返回 sections，
  //    而调用方无条件标记成功、移除卡片——用户点了接受，简历却一个字没变。
  const ghost = {
    target: {
      sectionKey: "experience",
      itemId: "does-not-exist",
      fieldKey: "summary",
      kind: "html",
      label: "Ghost",
    },
    before: "<p>Old</p>",
    after: "<p>New</p>",
  } as Parameters<typeof applyChangeToSections>[1];

  const miss = applyChangeToSections(current, ghost);
  assert.equal(miss.applied, false);
  assert.deepEqual(miss.sections, current);

  const hit = applyChangeToSections(current, {
    ...ghost,
    target: { ...ghost.target, itemId: "exp-1" },
  });
  assert.equal(hit.applied, true);
  assert.equal(
    (hit.sections.experience as Array<Record<string, unknown>>)[0].summary,
    "<p>New</p>",
  );
}

/** 改动到得了画布吗——两条曾经让它到不了的路。 */
function testCanvasReachability() {
  // ① 选区级 diff 的三个预览字段必须活着穿过投影。漏掉它们时「选中一句话让 AI 改」
  //    仍然工作，只是画布上整段变成红删绿增——功能没报错，只是悄悄退化成了整字段替换。
  const view = toPendingView({
    "sections.experience[exp-1].summary": {
      id: "chg-1",
      action: "rewrite",
      seed: 0,
      target: {
        sectionKey: "experience",
        itemId: "exp-1",
        fieldKey: "summary",
        kind: "html",
        label: "Summary",
      },
      before: "<p>Whole paragraph.</p>",
      after: "<p>Whole paragraph, rewritten.</p>",
      previewBefore: "one sentence",
      previewAfter: "one better sentence",
      previewKind: "text",
      rationale: "tighter",
      status: "pending",
    },
  } as Parameters<typeof toPendingView>[0]);

  const projected = view["sections.experience[exp-1].summary"];
  assert.equal(projected.previewBefore, "one sentence");
  assert.equal(projected.previewAfter, "one better sentence");
  assert.equal(projected.previewKind, "text");

  // ② 分辨出「当前模板上没有就地落点」的改动。它们**不会被丢弃**——改动列表能列出、
  //    「全部接受」能应用，全程不需要 DOM；分辨出来只是为了告诉用户去哪看。丢掉它们等于
  //    把 company / position / date 这些字段重新变回「AI 改了但你永远看不到」。
  const mk = (fieldKey: string, isInsert = false) =>
    ({
      target: {
        sectionKey: "experience",
        itemId: "exp-1",
        fieldKey,
        kind: "text",
        label: fieldKey,
      },
      before: "a",
      after: "b",
      rationale: "",
      isInsert,
    }) as Parameters<typeof partitionByAnchor>[0][number];

  const rendered = new Set(["sections.experience[exp-1].summary"]);
  const { renderable, orphaned } = partitionByAnchor(
    [mk("summary"), mk("company"), mk("newField", true)],
    (path) => rendered.has(path),
  );

  assert.equal(renderable.length, 2); // summary 有锚点；新增条目由插槽接住
  assert.equal(orphaned.length, 1);
  assert.equal(orphaned[0].target.fieldKey, "company");
  // 两边加起来必须是全部——一条都不能在分辨的过程中消失。
  assert.equal(renderable.length + orphaned.length, 3);
}

/** diff 覆盖面：白名单之外的字段此前永远不会出现在画布上。 */
function testDiffFieldCoverage() {
  const current: Section = {
    experience: [
      {
        id: "exp-1",
        visible: true,
        company: "星河科技",
        position: "前端工程师",
        date: "2022.03 - 至今",
        summary: "<p>负责管理后台。</p>",
      },
    ],
  };

  // 只改公司名——此前 DIFF_FIELDS 里没有 company，这次改动在画布上**永远不出现**，
  // 用户看到的是「说改了、什么都没变」。
  const renamed: Section = {
    experience: [{ ...current.experience[0], company: "星河科技（北京）" }],
  };
  const changes = diffResumeToChanges(current, renamed, "optimize");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].target.fieldKey, "company");
  assert.equal(changes[0].target.label, "工作经历 · 第 1 条 · 公司");
  // 纯文本字段按值判成 text，不是一律当富文本。
  assert.equal(changes[0].target.kind, "text");

  // 富文本仍判为 html。
  const rewritten: Section = {
    experience: [
      {
        ...current.experience[0],
        summary: "<p>负责管理后台，支撑 12 条业务线。</p>",
      },
    ],
  };
  const rich = diffResumeToChanges(current, rewritten, "optimize");
  assert.equal(rich.length, 1);
  assert.equal(rich[0].target.kind, "html");

  // id / visible 不该被当成内容改动——它们是结构，不是文案。
  const restructured: Section = {
    experience: [{ ...current.experience[0], visible: false }],
  };
  assert.equal(
    diffResumeToChanges(current, restructured, "optimize").length,
    0,
  );

  // 一次改多个字段就是多张卡，每张各自可接受/丢弃。
  const multi: Section = {
    experience: [
      {
        ...current.experience[0],
        company: "星河科技（北京）",
        position: "高级前端工程师",
      },
    ],
  };
  const multiChanges = diffResumeToChanges(
    current,
    multi,
    "optimize",
    undefined,
    undefined,
    undefined,
    new Map([
      ["experience/exp-1/company", "补全公司所在地"],
      ["experience/exp-1/position", "职位对齐目标岗位"],
    ]),
  );
  assert.equal(multiChanges.length, 2);
  assert.equal(
    multiChanges.find((change) => change.target.fieldKey === "company")
      ?.rationale,
    "补全公司所在地",
  );
  assert.equal(
    multiChanges.find((change) => change.target.fieldKey === "position")
      ?.rationale,
    "职位对齐目标岗位",
  );
  assert.deepEqual(
    multiChanges.map((change) => change.target.label),
    ["工作经历 · 第 1 条 · 公司", "工作经历 · 第 1 条 · 职位"],
  );
}

function testCitationSources() {
  const sources = normalizeCitationSources([
    {
      id: "external:2",
      kind: "external",
      visibility: "visible",
      citationId: 2,
      title: "公开岗位",
      url: "https://jobs.example.com/role",
      faviconUrl: "https://jobs.example.com/assets/icon.png",
    },
    {
      id: "internal:k1",
      kind: "internal",
      visibility: "hidden",
      title: "内部面经",
      url: "https://internal.example.com/k1",
    },
    {
      id: "external:bad",
      kind: "external",
      visibility: "visible",
      citationId: 9,
      title: "不安全来源",
      url: "javascript:alert(1)",
    },
  ]);

  assert.equal(sources.length, 2, "非法协议必须在 SSE 边界丢弃");
  assert.equal(
    visibleCitationSources(sources).length,
    1,
    "内部来源当前不在 C 端显示",
  );
  assert.equal(
    sources[0]?.faviconUrl,
    "https://jobs.example.com/assets/icon.png",
  );
  assert.equal(
    siteFaviconUrl("https://jobs.example.com/role"),
    "https://jobs.example.com/favicon.ico",
  );
  assert.equal(
    siteFaviconUrl("https://jobs.example.com/role", "javascript:alert(1)"),
    "https://jobs.example.com/favicon.ico",
  );
  assert.equal(
    linkCitationMarkers("公开要求 [2]，未知 [9]。", sources),
    "公开要求 [2](#citation-2)，未知 [9](#citation-missing-9)。",
  );
  assert.equal(
    linkCitationMarkers(
      '已有 [2](https://elsewhere.example) 和 `代码 [2]`\n```ts\nconst x = "[2]"\n```',
      sources,
    ),
    '已有 [2](https://elsewhere.example) 和 `代码 [2]`\n```ts\nconst x = "[2]"\n```',
  );
  const groupedSources = normalizeCitationSources([
    ...sources,
    {
      id: "external:3",
      kind: "external",
      visibility: "visible",
      citationId: 3,
      title: "同站另一岗位",
      url: "https://jobs.example.com/another-role",
    },
    {
      id: "external:4",
      kind: "external",
      visibility: "visible",
      citationId: 4,
      title: "另一招聘站",
      url: "https://campus.example.net/jobs",
    },
  ]);
  assert.equal(
    linkCitationMarkers("同站 [2][3]，跨站 [2][4][3]。", groupedSources),
    "同站 [2,3](#citations-2-3)，跨站 [2](#citation-2)[4](#citation-4)[3](#citation-3)。",
  );
  assert.equal(
    mergeCitationSources(sources, [
      { ...sources[0], title: "更新后的标题" },
    ]).filter((source) => source.id === "external:2").length,
    1,
  );

  const recovered = citationSourcesFromWebSearchToolResult({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "ok",
          results: [
            {
              citationId: 6,
              title: "校招官网",
              url: "https://campus.example.com/jobs",
              snippet: "公开要求",
            },
          ],
        }),
      },
    ],
  });
  assert.equal(recovered[0]?.citationId, 6);

  const citationMarkup = renderToStaticMarkup(
    createElement(
      Markdown as ComponentType<{
        sources?: typeof sources;
        children?: string;
      }>,
      { sources },
      "公开要求 [2]。",
    ),
  );
  assert.match(citationMarkup, /data-citation-id="2"/);
  assert.match(citationMarkup, /jobs\.example\.com/);
  assert.doesNotMatch(citationMarkup, />2<\//);
  assert.doesNotMatch(citationMarkup, /\[2\]/);

  const groupedCitationMarkup = renderToStaticMarkup(
    createElement(
      Markdown as ComponentType<{
        sources?: typeof groupedSources;
        children?: string;
      }>,
      { sources: groupedSources },
      "同站来源 [2][3]。",
    ),
  );
  assert.match(groupedCitationMarkup, /data-citation-group="2,3"/);
  assert.match(groupedCitationMarkup, /data-citation-id="2"/);
  assert.match(groupedCitationMarkup, /data-citation-id="3"/);
  assert.match(groupedCitationMarkup, />2 个来源<\/span>/);
  assert.doesNotMatch(groupedCitationMarkup, />[23]<\//);
  assert.doesNotMatch(groupedCitationMarkup, /\[2\]\[3\]/);

  const missingCitationMarkup = renderToStaticMarkup(
    createElement(
      Markdown as ComponentType<{
        sources?: typeof sources;
        children?: string;
      }>,
      { sources },
      "多来源 [2][9][14]。",
    ),
  );
  assert.match(missingCitationMarkup, /data-citation-id="2"/);
  assert.match(missingCitationMarkup, /data-citation-missing="9,14"/);
  assert.match(missingCitationMarkup, />来源暂不可用<\/span>/);
  assert.doesNotMatch(missingCitationMarkup, />9,14<\//);
  assert.doesNotMatch(missingCitationMarkup, /\[(?:2|9|14)\]/);
}

function testAfterAuthUrl() {
  // The middleware puts the original path in `redirect_url`. Nothing read it,
  // so a lapsed session on /billing/return?orderId=… came back to /dashboard
  // and the order id was gone — no polling, and no sync, which is the only
  // thing that captures a PayPal payment from the browser.
  assert.equal(
    afterAuthUrl("redirect_url=%2Fbilling%2Freturn%3ForderId%3Dcmxyz"),
    "/billing/return?orderId=cmxyz",
  );
  assert.equal(afterAuthUrl(""), "/dashboard");
  assert.equal(afterAuthUrl(null), "/dashboard");
  assert.equal(afterAuthUrl("foo=bar"), "/dashboard");

  // Same-origin paths only: a freshly signed-in session must not be bounced
  // off the site by a crafted link.
  assert.equal(
    afterAuthUrl("redirect_url=https%3A%2F%2Fevil.example"),
    "/dashboard",
  );
  assert.equal(afterAuthUrl("redirect_url=%2F%2Fevil.example"), "/dashboard");
  assert.equal(afterAuthUrl("redirect_url=%2F%5Cevil.example"), "/dashboard");
  assert.equal(
    afterAuthUrl("redirect_url=javascript%3Aalert(1)"),
    "/dashboard",
  );

  // The URL parser strips tab/LF/CR before resolving, so a prefix check on
  // '//' is not enough — these resolved to https://evil.example.
  assert.equal(
    afterAuthUrl("redirect_url=%2F%09%2F%2Fevil.example"),
    "/dashboard",
  );
  assert.equal(
    afterAuthUrl("redirect_url=%2F%0A%2F%2Fevil.example"),
    "/dashboard",
  );
  assert.equal(
    afterAuthUrl("redirect_url=%2F%0D%2F%2Fevil.example"),
    "/dashboard",
  );
}

function testSectionOwnership() {
  // `profiles` ships in defaultResume and templates render it, so offering
  // delete on it destroyed data that normalize cannot bring back.
  for (const builtin of [
    "basics",
    "experience",
    "education",
    "projects",
    "skills",
    "languages",
    "certificates",
    "profiles",
  ]) {
    assert.equal(
      isCustomSection(builtin),
      false,
      `${builtin} must not be deletable`,
    );
  }
  assert.equal(isCustomSection("personalStrengths"), true);

  // A custom title must never mint a reserved key.
  assert.notEqual(customSectionKey("Basics", ["skills"]), "basics");
  assert.notEqual(customSectionKey("Profiles", ["skills"]), "profiles");

  // The icon has to survive normalize — it runs on every drag and every write.
  const withIcon = normalizeResumeSectionOrder(
    [{ key: "personalStrengths", label: "个人优势", icon: "trophy" }],
    { personalStrengths: [] },
  );
  assert.equal(
    withIcon.find((s) => s.key === "personalStrengths")?.icon,
    "trophy",
  );
}

function testSectionOrderCoercion() {
  // A model told the legacy contract writes bare strings. Nothing validated it,
  // so `.map(s => s.key)` gave undefined for every entry and the whole draft
  // rendered blank — correct-looking JSON, no error anywhere.
  assert.deepEqual(coerceSectionOrder(["experience", "projects"]), [
    { key: "experience", label: "sections.experience" },
    { key: "projects", label: "sections.projects" },
  ]);

  // Already-correct input passes through untouched, icon and all.
  const proper = [{ key: "skills", label: "专业技能", icon: "wrench" }];
  assert.deepEqual(coerceSectionOrder(proper), proper);

  // Junk is dropped rather than turned into keyless entries.
  assert.deepEqual(
    coerceSectionOrder(["", "  ", null, 42, {}, { key: "" }]),
    [],
  );
  assert.deepEqual(coerceSectionOrder(undefined), []);
  assert.deepEqual(coerceSectionOrder("experience"), []);

  // Coercion must not complete the list: a draft preview shows what the model
  // wrote, not every default section as an empty heading.
  assert.equal(coerceSectionOrder(["experience"]).length, 1);

  // But normalize (the editor path) still completes it, and keeps the order the
  // strings gave instead of falling back to the default sequence.
  const normalized = normalizeResumeSectionOrder(
    ["projects", "experience"] as unknown as SectionOrder[],
    { projects: [], experience: [] },
  );
  const keys = normalized.map((s) => s.key);
  assert.equal(keys[0], "basics");
  assert.ok(
    keys.indexOf("projects") < keys.indexOf("experience"),
    "model order lost",
  );
  assert.ok(
    keys.includes("skills"),
    "built-in section missing after normalize",
  );
}

/**
 * 错误契约（Core ADR-0018）：码是后端下发的，文案是前端的。
 *
 * 这条覆盖测试是那条分界能成立的前提——后端加了新码而前端没写文案，就在这里红。没有它，
 * 「文案归前端」只是一句口号，实际会退化成用户在屏幕上读到一个标识符。
 */
function testErrorCopyCoverage() {
  for (const code of [...APP_ERROR_CODES, "unknown"]) {
    for (const [lang, dict] of [
      ["zh", zhCopy],
      ["en", enCopy],
    ] as const) {
      const copy = (dict.errors as Record<string, unknown>)[code];
      assert.equal(typeof copy, "string", `${lang} 缺少 errors.${code} 的文案`);
      assert.ok(
        (copy as string).trim().length > 0,
        `${lang} errors.${code} 是空串`,
      );
    }
  }

  // 两侧必须同构：只补一种语言等于给另一种语言的用户留了一个标识符。
  assert.deepEqual(
    Object.keys(zhCopy.errors).sort(),
    Object.keys(enCopy.errors).sort(),
    "zh / en 的 errors 键不同构",
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
      message: "quota_exhausted",
      errorCode: "quota_exceeded",
      subCode: "daily_cap",
      params: { period: "daily", resetAt: "2026-08-13T00:00:00Z" },
      requestId: "req-1",
      retryable: false,
    },
    "bff",
  );
  assert.equal(quota.errorCode, "quota_exceeded");
  assert.notEqual(quota.errorCode, "rate_limited");
  assert.equal(quota.params?.period, "daily");
  assert.equal(quota.requestId, "req-1");
  assert.equal(quota.retryable, false);
  assert.equal(opensBillingGate(quota.errorCode), true);

  // 老后端：只有状态码。降级到今天的粒度，不会更差。
  const legacyStatus = fromErrorBody(429, { code: 429, message: "" }, "bff");
  assert.equal(legacyStatus.errorCode, "rate_limited");
  assert.equal(legacyStatus.retryable, true);

  // 老后端 + 存量字符串码：那几周里这就是全部的可用信息。
  const legacyCode = fromErrorBody(429, { code: "quota_exhausted" }, "bff");
  assert.equal(legacyCode.errorCode, "quota_exceeded");
  assert.equal(legacyCode.subCode, "quota_exhausted");

  // 畸形体：不能因此再抛一个错。
  assert.equal(
    fromErrorBody(500, undefined, "bff").errorCode,
    "internal_error",
  );
  assert.equal(
    fromErrorBody(500, "not json", "bff").errorCode,
    "internal_error",
  );
  assert.equal(fromErrorBody(undefined, {}, "local").errorCode, "unknown");

  // 老 BFF 那句 "Backend request failed with status 429" 绝不能当文案渲染。
  const bffNoise = fromErrorBody(
    429,
    { error: "Backend request failed with status 429" },
    "bff",
  );
  assert.equal(bffNoise.publicMessage, undefined);

  // message 只是机器码时同样不算文案。
  assert.equal(
    fromErrorBody(
      429,
      { code: "quota_exhausted", message: "quota_exhausted" },
      "bff",
    ).publicMessage,
    undefined,
  );

  // 网络断了是「依赖够不着」，不是「我们有 bug」。
  const network = fromThrown(new TypeError("Failed to fetch"));
  assert.equal(network.errorCode, "upstream_unavailable");
  assert.equal(network.retryable, true);

  // 用户点了停止：不是故障，静默丢弃。
  const aborted = fromThrown(
    Object.assign(new Error("x"), { name: "AbortError" }),
  );
  assert.equal(isAborted(aborted), true);
  assert.equal(presentAppError(aborted), null);

  // SSE 帧：payload.errorCode 优先，老的 error 字段仍认。
  assert.equal(
    fromSseEvent({
      error: "quota_exceeded",
      payload: { code: "quota_exceeded" },
    }).errorCode,
    "quota_exceeded",
  );
  assert.equal(
    fromSseEvent({ error: "agent_run_failed", payload: {} }).errorCode,
    "internal_error",
  );
}

/** 文案：本地化的码文案永远当标题，服务端那句只能是补充行。 */
function testErrorCopy() {
  const t = (key: string, options?: Record<string, unknown>) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (acc, part) =>
          typeof acc === "object" && acc !== null
            ? (acc as Record<string, unknown>)[part]
            : undefined,
        zhCopy,
      );
    if (typeof value !== "string") {
      return (options?.defaultValue as string | undefined) ?? key;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(options?.[name] ?? ""),
    );
  };

  const copy = appErrorCopy(
    {
      errorCode: "content_rejected",
      retryable: false,
      source: "sse",
      publicMessage: "This PDF looks like a scan — we could not read any text.",
    },
    t,
  );
  // 屏幕上永远不会只剩一句外语：标题一定是本地语言。
  assert.equal(copy.title, zhCopy.errors.content_rejected);
  assert.equal(
    copy.detail,
    "This PDF looks like a scan — we could not read any text.",
  );

  // 旧服务只给 429 时没有 retryAfter；页面也绝不能把模板变量原样交给用户。
  const rateLimited = appErrorCopy(
    { errorCode: "rate_limited", retryable: true, source: "sse" },
    t,
  );
  assert.equal(rateLimited.title, "请求太密集了，5 秒后再试");
  assert.ok(!rateLimited.title.includes("{{"));

  // 认不出的码退到通用兜底，而不是把标识符渲染出来。
  const unknown = appErrorCopy(
    { errorCode: "unknown", retryable: false, source: "http" },
    t,
  );
  assert.equal(unknown.title, zhCopy.errors.unknown);
  assert.ok(!unknown.title.includes("errors."));
}

/**
 * BFF 那一跳：**白名单本身就是安全边界**。
 *
 * 之前是整体替换（连码都丢了），改成透传又会把上游写给运营的英文、以及这个部署配了哪些
 * 支付渠道，一路送到买家屏幕上——commercial 那次事故泄漏的正是「available: paypal」。
 * 所以是投影，不是代理。
 */
function testBffErrorProjection() {
  const upstream = JSON.stringify({
    code: 429,
    message: "Plan change unavailable: configured channels are paypal, alipay",
    error: "QuotaExceededError",
    errorCode: "quota_exceeded",
    subCode: "daily_cap",
    params: { period: "daily", resetAt: "2026-08-13T00:00:00Z" },
    requestId: "req-9",
    retryable: false,
  });

  const projected = projectUpstreamError(429, upstream);
  assert.deepEqual(projected, {
    errorCode: "quota_exceeded",
    subCode: "daily_cap",
    params: { period: "daily", resetAt: "2026-08-13T00:00:00Z" },
    requestId: "req-9",
    retryable: false,
    error: "quota_exceeded",
  });
  // 上游原文一个字都不许过来。
  assert.ok(!("message" in projected));
  assert.ok(!JSON.stringify(projected).includes("paypal"));

  // 老后端：只有状态码，`error` 退到一个机器可读的标识而不是英文散文。
  assert.deepEqual(
    projectUpstreamError(429, JSON.stringify({ code: 429, message: "x" })),
    {
      error: "upstream_429",
    },
  );

  // 上游回了一页 HTML：不能因此再抛一个错。
  assert.deepEqual(projectUpstreamError(502, "<html>502</html>"), {
    error: "upstream_502",
  });

  // 走完整条链：投影出来的东西，normalize 必须还能读回同一个码。
  const roundTrip = fromErrorBody(
    429,
    projectUpstreamError(429, upstream),
    "bff",
  );
  assert.equal(roundTrip.errorCode, "quota_exceeded");
  assert.notEqual(roundTrip.errorCode, "rate_limited");
  assert.equal(roundTrip.params?.period, "daily");
  assert.equal(roundTrip.requestId, "req-9");
}

/**
 * 任务清单卡的两条判据 + 片段降级。
 *
 * 判据是从 ChatThread 搬到 TasksCard 的——搬动最容易在语义上出错的地方，正是这种
 * 「看起来只是换个文件」的改动，所以把行为钉死在这里。
 */
function testTasksCard() {
  const plan = (
    todos: PlanTodo[],
    extra: Partial<ChatMessage> = {},
  ): ChatMessage =>
    ({ id: "p", role: "plan", content: "", todos, ...extra }) as ChatMessage;

  // 一条未完成就不算跑完；空清单也不算——否则卡片刚建好、一条 todo 都还没到时
  // 就会被判成"完成"，然后立刻退场。
  assert.equal(isPlanFulfilled(plan([])), false);
  assert.equal(
    isPlanFulfilled(
      plan([
        { content: "a", status: "completed" },
        { content: "b", status: "pending" },
      ]),
    ),
    false,
  );
  assert.equal(
    isPlanFulfilled(plan([{ content: "a", status: "completed" }])),
    true,
  );

  // 子代理清单没有右侧产物，不能退场——退了就"起过一个子代理"这件事无迹可寻。
  const doneTodos: PlanTodo[] = [{ content: "a", status: "completed" }];
  assert.equal(isRetirablePlan(plan(doneTodos)), true);
  assert.equal(
    isRetirablePlan(plan(doneTodos, { subagentName: "translator" })),
    false,
  );
  assert.equal(
    isRetirablePlan(plan([{ content: "a", status: "pending" }])),
    false,
  );

  // 普通计划完成后只留摘要；只有明确绑定画布产物的计划才显示“查看”。
  const ordinaryRetired = renderToStaticMarkup(
    createElement(TasksCard, {
      message: plan(doneTodos, { content: "任务清单" }),
      retired: true,
      onToggleCanvas: () => undefined,
      isCanvasOpen: false,
    }),
  );
  assert.match(ordinaryRetired, /任务清单/);
  assert.doesNotMatch(ordinaryRetired, />查看</);

  const analysisRetired = renderToStaticMarkup(
    createElement(TasksCard, {
      message: plan(doneTodos, {
        content: "简历分析",
        skillId: "analyze",
      }),
      retired: true,
      onToggleCanvas: () => undefined,
      isCanvasOpen: false,
    }),
  );
  assert.match(analysisRetired, />查看</);

  // 片段降级：后端没发 segments（老后端、或模型没写标记）时，整条 content 当一段纯文本。
  assert.deepEqual(segmentsOf({ content: "把摘要改短", status: "pending" }), [
    { type: "text", text: "把摘要改短" },
  ]);
  assert.deepEqual(
    segmentsOf({ content: "x", status: "pending", segments: [] }),
    [{ type: "text", text: "x" }],
  );
  // 有 segments 就用它，content 只是给不认 segments 的消费者看的。
  const segs: TodoSegment[] = [
    { type: "chip", verb: "读取", rest: "简历", kind: "read" },
    { type: "text", text: "再决定" },
  ];
  assert.deepEqual(
    segmentsOf({
      content: "读取 简历 再决定",
      status: "pending",
      segments: segs,
    }),
    segs,
  );

  const zhUnits = { hour: "小时", minute: "分", second: "秒", separator: "" };
  assert.equal(formatElapsedDuration(0, zhUnits), "0秒");
  assert.equal(formatElapsedDuration(59, zhUnits), "59秒");
  assert.equal(formatElapsedDuration(60, zhUnits), "1分0秒");
  assert.equal(formatElapsedDuration(3599, zhUnits), "59分59秒");
  assert.equal(formatElapsedDuration(3600, zhUnits), "1小时0分0秒");
  assert.equal(formatElapsedDuration(56_950, zhUnits), "15小时49分10秒");
}

function testMarkdownSource() {
  // 流式 chunk 只到列表标记时不画空圆点；有正文的列表项必须原样保留。
  assert.equal(
    normalizeMarkdownSource(
      "结论\n- \n*\n+\n1.\n2)\n- **\n- __\n- ~~\n- `\n- [ ]",
    ),
    "结论",
  );
  assert.equal(
    normalizeMarkdownSource("结论\n- 第一项\n  - 子项\n\n- 第二项"),
    "结论\n- 第一项\n  - 子项\n\n- 第二项",
  );
  // 尾部空行会让流式光标掉到新的一行，也一并收掉。
  assert.equal(normalizeMarkdownSource("最后一句\n\n  "), "最后一句");
}

/**
 * 一次中断的分派与续跑闸门。
 *
 * 这一组全部对着**错了不会报错**的失败模式：引擎只校验「裁决数量等于动作数量」，装错了槽
 * 它照样接受，然后模型收到的是别的动作的答复；界面上什么都不会红，人也看不出来。
 */
function testInterruptPlan() {
  // 用**真注册表**而不是桩：路由出来的 kind 要是没登记，卡就静默降级成一行文本，
  // 而桩会永远说「登记了」。
  const opts = {
    hasWidget: (kind: string) => Boolean(WIDGETS[kind]),
    resolveKind: (toolName: string, args?: Record<string, unknown>) =>
      toolName === "ask_choice"
        ? askChoiceKind(args)
        : toolName === "request_form"
          ? requestFormKind(args)
          : toolName,
    allowsResumeRead: true,
  };

  // ① 页号 ≠ 槽号。被跳过的动作不占页，从那之后两者永远错开——这正是最容易写成
  //    `decisions[pageIndex]` 的地方。
  const skipped = planInterrupt(
    "req-1",
    [
      { name: "read_resume" },
      { name: "request_form", args: { formKind: "job_info" } },
      { name: "write_resume", args: { reason: "改写第 2 段" } },
    ],
    { ...opts, allowsResumeRead: false },
  );
  assert.equal(skipped.total, 3, "裁决数必须等于动作数，跳过的也算");
  assert.deepEqual(skipped.autoRejected, [{ requestId: "req-1", index: 0 }]);
  assert.equal(skipped.gates.length, 1);
  // 闸门是第 3 个动作，但它是这张卡的**第 1 页**。写成页号就是 0，那会把裁决装进
  // 已经被自动拒掉的读简历槽里。
  assert.equal(skipped.gates[0].slotIndex, 2);
  assert.equal(skipped.widgets[0].slot.index, 1);

  const logoPicker = planInterrupt(
    "req-logo",
    [
      {
        name: "request_form",
        args: {
          formKind: "company_logos",
          options: {
            companies: ["腾讯"],
            "candidates:腾讯": ["https://cdn.test/tencent.svg"],
          },
        },
      },
    ],
    opts,
  );
  assert.equal(logoPicker.widgets[0].kind, "company_logo_picker");
  assert.equal(logoPicker.widgets[0].toolName, "request_form");
  const normalizedLogos = WIDGETS.company_logo_picker.normalize?.({
    formKind: "company_logos",
    options: {
      companies: ["腾讯", "腾讯", "携程"],
      "candidates:腾讯": [
        "https://cdn.test/tencent-symbol.svg",
        "https://cdn.test/tencent-logo.svg",
        "http://unsafe.test/logo.png",
      ],
    },
  }) as { companies?: Array<{ name: string; candidates: string[] }> } | null;
  assert.deepEqual(normalizedLogos?.companies, [
    {
      name: "腾讯",
      candidates: [
        "https://cdn.test/tencent-symbol.svg",
        "https://cdn.test/tencent-logo.svg",
      ],
    },
    { name: "携程", candidates: [] },
  ]);

  // ② 闸门收成一张卡，表单各自成卡——不是「全塞一张」也不是「一个动作一张」。
  const mixed = planInterrupt(
    "req-2",
    [
      { name: "read_resume", args: { reason: "想读你的简历" } },
      { name: "request_form", args: { formKind: "job_info" } },
      { name: "write_resume" },
    ],
    opts,
  );
  assert.equal(mixed.gates.length, 2, "两个闸门 → 一张卡两页");
  assert.deepEqual(
    mixed.gates.map((g) => g.slotIndex),
    [0, 2],
  );
  assert.equal(mixed.gates[0].question, "想读你的简历");
  assert.equal(mixed.widgets.length, 1);

  // ③ 卡的 kind 可能是路由出来的别名，但 `edit` 续跑必须报回真实工具名——拿别名去续跑
  //    会指向一个不存在的工具。
  const routed = planInterrupt(
    "req-3",
    [{ name: "ask_choice", args: { message: "先改哪段？", recommended: 0 } }],
    opts,
  );
  assert.equal(routed.widgets[0].kind, "ask_choice_recommended");
  assert.equal(routed.widgets[0].toolName, "ask_choice");
  // 没表态就不该被路由走，否则存量的一排 chips 全变成推荐卡。
  const plain = planInterrupt(
    "req-4",
    [{ name: "ask_choice", args: { message: "先改哪段？" } }],
    opts,
  );
  assert.equal(plain.widgets[0].kind, "ask_choice");

  // ④ 续跑闸门：少一个裁决就不许发。漏发必然 400，而多发一次会重复计费。
  let slots = openDecisions<string>(3);
  let step = fillDecision(slots, 2, "approve");
  assert.equal(step.ready, false, "只答了一个不能续跑");
  step = fillDecision(step.slots, 0, "reject");
  assert.equal(step.ready, false);
  step = fillDecision(step.slots, 1, "approve");
  assert.equal(step.ready, true, "填满才续跑");
  assert.deepEqual(step.slots, ["reject", "approve", "approve"]);

  // ⑤ 越界的裁决必须是空操作，且**不能**让运行判定「答完了」。
  //    这条不变量由 `fillDecision` 的构造保证（map 重建而非下标赋值）；下标赋值会把
  //    数组撑长并留下空洞，而 `every` 跳过空洞——运行会带着半份裁决续跑。
  slots = openDecisions<string>(2);
  const oob = fillDecision(slots, 5, "approve");
  assert.equal(oob.ready, false);
  assert.deepEqual(oob.slots, [null, null]);
  assert.equal(oob.slots.length, 2, "越界不许改变槽位数——它就是裁决数");

  // ⑥ 同一个槽答两次是覆盖，不是追加——否则重复点击会把数量撑过动作数。
  const twice = fillDecision(
    fillDecision(openDecisions<string>(1), 0, "approve").slots,
    0,
    "reject",
  );
  assert.deepEqual(twice.slots, ["reject"]);
  assert.equal(twice.ready, true);
}

function testAnalysisImprovementActions() {
  assert.ok(
    FORM_DEFS.analysis_evidence,
    "后端允许的分析证据表单必须在前端注册",
  );
  const persona = {
    persona: "peer_developer" as const,
    score: 80,
    categories_scores: {},
    strengths: [],
    weaknesses: ["量化口径不完整"],
    suggestions: ["补充周期和基线"],
  };
  const legacy = analysisImprovementActions({
    overall_score: 80,
    category_averages: {},
    peer_analysis: persona,
    leader_analysis: { ...persona, persona: "tech_lead" },
    hrbp_analysis: { ...persona, persona: "hrbp" },
  });
  assert.equal(legacy.length, 1, "旧报告仍应生成可执行整改动作");
  assert.equal(legacy[0].problem, "量化口径不完整");

  const structured = analysisImprovementActions({
    overall_score: 80,
    category_averages: {},
    peer_analysis: persona,
    leader_analysis: { ...persona, persona: "tech_lead" },
    hrbp_analysis: { ...persona, persona: "hrbp" },
    improvement_actions: [
      {
        id: "issue-1",
        problem: "量化口径不完整",
        suggestion: "补充周期和基线",
        evidence: [
          {
            sectionKey: "experience",
            itemId: "exp-1",
            fieldKey: "description",
            path: "sections.experience[exp-1].description",
            quote: "好评率提升至 92%",
          },
        ],
        missingEvidence: ["统计周期"],
      },
    ],
  });
  assert.equal(structured[0].evidence[0].itemId, "exp-1");
  assert.deepEqual(structured[0].missingEvidence, ["统计周期"]);
}

/**
 * 工具行的动词必须两种语言都有译文。
 *
 * 缺一条的表现是求职者看到「处理」——不报错、不崩，只有截图能发现。真正的源头
 * （Core 的 `TOOL_DISPLAY`）和这份 i18n 不在同一个仓，没有测试能同时看到两边，
 * 所以这里只守住本仓这一半：清单里的词都得有译文。另一半靠 `toolTrace` 的开发态告警。
 */
function testAgentToolVerbCoverage() {
  for (const [lang, copy] of [
    ["zh", zhCopy],
    ["en", enCopy],
  ] as const) {
    const tools = copy.aiLab.tools as unknown as Record<string, unknown>;
    for (const verb of AGENT_TOOL_VERBS) {
      assert.equal(
        typeof tools[verb],
        "string",
        `${lang} 缺 aiLab.tools.${verb}——这个工具会退成「处理」`,
      );
    }
    assert.equal(typeof tools.fallback, "string", `${lang} 缺兜底文案`);
  }

  // 图标同理：后端指过来的键不在 KNOWN_ICONS 里就静默退成扳手。这里钉住渲染路径
  // 认得每一个真实使用中的图标键。
  const t = (key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        zhCopy,
      ) as string;
  const rows = toToolChipRows(
    [
      {
        toolCallId: "c1",
        toolName: "x",
        done: true,
        summary: { verb: "track", icon: "track" },
      },
      {
        toolCallId: "c2",
        toolName: "y",
        done: true,
        summary: { verb: "ask", icon: "ask" },
      },
      {
        toolCallId: "c3",
        toolName: "z",
        done: true,
        summary: { verb: "plan", icon: "plan" },
      },
    ] as never,
    t as never,
  );
  assert.deepEqual(
    rows.map((row) => row.icon),
    ["track", "ask", "plan"],
    "认得的图标键不该被退成 tool",
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["记录", "提问", "列计划"],
  );
}

function testAgentCapabilityWidgets() {
  for (const kind of [
    "job_research",
    "company_research",
    "interview_prep",
    "application_tracker",
    "template_replica",
  ]) {
    assert.ok(WIDGETS[kind], `${kind} 必须在 C 端注册，不能退化成 unsupported`);
  }

  const company = normalizeResearchWidgetProps(
    {
      title: "Acme · 前端工程师",
      groups: {
        business_context: [
          {
            text: "公开招聘页面仍在更新",
            url: "https://jobs.example.com/frontend",
            sourceName: "Acme Careers",
            date: "2026-08-14",
          },
        ],
        risks_unknowns: [
          { text: "不安全来源必须丢 URL", url: "javascript:alert(1)" },
        ],
      },
    },
    "company",
  );
  assert.equal(company?.groups[0].items[0].domain, "jobs.example.com");
  assert.equal(company?.groups[1].items[0].url, undefined);

  const interview = normalizeResearchWidgetProps(
    {
      groups: [
        {
          key: "likely_questions",
          title: "公开题型",
          items: ["讲讲一次性能优化"],
        },
      ],
    },
    "interview",
  );
  assert.equal(interview?.groups[0].actionable, true);

  // 生产中的 push_ui 契约是数组，不是旧版固定 key 对象。这个形状曾被后端验收、
  // SSE 和会话存储完整保留，却在前端 normalizer 里被当成对象读成 0 组。
  const jobResearchMarkup = renderToStaticMarkup(
    createElement(WidgetHost, {
      registry: WIDGETS,
      instance: {
        widgetId: "job-research-current-wire-shape",
        kind: "job_research",
        props: {
          message: "字节跳动 · 前端工程师",
          groups: [
            {
              title: "岗位门槛",
              tone: "info",
              items: ["React/Vue 深度与复杂项目架构经验 [11][12]"],
            },
            {
              title: "风险点",
              tone: "warning",
              actionable: true,
              items: ["需要补充 Node.js 服务端项目证据 [11]"],
            },
          ],
        },
        status: "pending",
      },
      context: {
        sources: [
          {
            id: "external:11",
            kind: "external",
            visibility: "visible",
            citationId: 11,
            title: "招聘官网",
            url: "https://jobs.example.com/frontend",
          },
          {
            id: "external:12",
            kind: "external",
            visibility: "visible",
            citationId: 12,
            title: "岗位说明",
            url: "https://careers.example.org/role",
          },
        ],
      },
      onAction: () => undefined,
    }),
  );
  assert.match(jobResearchMarkup, /字节跳动 · 前端工程师/);
  assert.match(jobResearchMarkup, /React\/Vue 深度与复杂项目架构经验/);
  assert.match(jobResearchMarkup, /data-citation-id="11"/);
  assert.match(jobResearchMarkup, /data-citation-id="12"/);
  assert.doesNotMatch(jobResearchMarkup, /\[11\]\[12\]/);
  assert.match(jobResearchMarkup, /<button[^>]*>[\s\S]*data-citation-id="11"/);
  assert.doesNotMatch(
    jobResearchMarkup,
    /<button[^>]*>[\s\S]*<a[^>]*data-citation-id="11"/,
  );
  assert.doesNotMatch(jobResearchMarkup, /无法渲染的卡片/);

  const tracker = normalizeApplicationTrackerProps({
    applications: [
      {
        id: "app-1",
        company: "Acme",
        role: "Frontend Engineer",
        status: "interview",
        sourceUrl: "https://jobs.example.com/frontend",
        updatedAt: "2026-08-14T10:00:00.000Z",
      },
      { company: "Bad", role: "Unknown", status: "NOT_A_STATUS" },
    ],
  });
  assert.equal(tracker?.applications.length, 1);
  assert.equal(tracker?.applications[0].status, "INTERVIEW");

  const emptyTracker = normalizeApplicationTrackerProps({ applications: [] });
  // 列缺席也是合法的：用户没配过面板，前端用默认那五列。
  assert.deepEqual(emptyTracker, { columns: [], applications: [] });

  // 自定义列的取值与内置列分开：`fields` 里出现内置键说明后端把同一个事实存了两份，
  // 那会让面板显示一个和记录本身矛盾的值，所以在归一化这里就丢掉。
  const customColumns = normalizeApplicationTrackerProps({
    columns: [
      { key: "company" },
      { key: "headcount", label: "公司规模", type: "Text", source: "ai" },
      { key: "nameless", source: "ai" },
    ],
    applications: [
      {
        id: "a1",
        company: "Acme",
        role: "Frontend Engineer",
        status: "INTERVIEW",
        fields: {
          headcount: {
            value: "200–500",
            computedAt: "2026-08-26T00:00:00.000Z",
          },
          company: {
            value: "冒充内置列",
            computedAt: "2026-08-26T00:00:00.000Z",
          },
        },
      },
    ],
  });
  assert.deepEqual(
    customColumns?.columns.map((c) => c.key),
    ["company", "headcount"],
    "没有名字的自定义列没法显示，应被丢掉",
  );
  assert.equal(customColumns?.columns[0].builtin, true);
  assert.equal(customColumns?.columns[1].builtin, false);
  assert.deepEqual(customColumns?.applications[0].fields, {
    headcount: { value: "200–500", computed: true },
  });
  const emptyTrackerMarkup = renderToStaticMarkup(
    createElement(WidgetHost, {
      registry: WIDGETS,
      instance: {
        widgetId: "job-application-tracker",
        kind: "application_tracker",
        props: { applications: [] },
        status: "pending",
      },
      onAction: () => undefined,
    }),
  );
  assert.match(emptyTrackerMarkup, /还没有投递记录/);
  assert.doesNotMatch(emptyTrackerMarkup, /无法渲染的卡片/);

  const replicaMarkup = renderToStaticMarkup(
    createElement(WidgetHost, {
      registry: WIDGETS,
      instance: {
        widgetId: "template-replica",
        kind: "template_replica",
        props: {
          template: {
            version: 1,
            root: {
              id: "root",
              type: "Box",
              children: [
                {
                  id: "name",
                  type: "Text",
                  value: { read: "info.fullName" },
                },
              ],
            },
          },
        },
        status: "pending",
      },
      onAction: () => undefined,
    }),
  );
  assert.match(replicaMarkup, /复刻版式预览/);
  assert.doesNotMatch(replicaMarkup, /无法渲染的卡片/);

  const filterMarkup = renderToStaticMarkup(
    createElement(FilterTable as ComponentType<FilterTableProps>, {
      filters: [
        { key: "all", label: "全部", count: 1 },
        { key: "INTERVIEW", label: "面试中", count: 1 },
      ],
      columns: [],
      rows: [],
      pills: {},
    }),
  );
  assert.match(filterMarkup, /面试中/);
  assert.doesNotMatch(filterMarkup, /To do/);

  // RecordsTable 原本是零 props、吃 26 行写死的冰淇淋供应商。剥成 props 之后这条
  // 钉住它不会退回去——demo 数据回归的表现是「表格看起来正常，只是内容是别人的」，
  // 不报错、不崩，只有截图能看出来。
  const recordsMarkup = renderToStaticMarkup(
    createElement(RecordsTable as ComponentType<RecordsTableProps>, {
      ariaLabel: "投递记录",
      columns: [
        { key: "role", label: "岗位" },
        { key: "status", label: "状态" },
      ],
      rows: [
        {
          id: "r1",
          mark: "T",
          cells: { role: "前端开发实习生", status: "面试中" },
        },
      ],
    }),
  );
  assert.match(recordsMarkup, /前端开发实习生/);
  assert.doesNotMatch(recordsMarkup, /Aurora Scoops|Kumo Creamery/);
  // 英文状态标签也是写死的 demo 遗留，一并钉住。
  assert.doesNotMatch(recordsMarkup, /Very strong|No communication/);
}

function testStreamingTextBuffer() {
  let scheduled: (() => void) | null = null;
  let scheduledDelay = 0;
  let cancelled = 0;
  const frames: { content: string; reasoning: string }[] = [];
  const buffer = createStreamingTextBuffer({
    onFrame: (snapshot) => frames.push(snapshot),
    schedule: (callback, delayMs) => {
      scheduled = callback;
      scheduledDelay = delayMs;
      return {} as ReturnType<typeof setTimeout>;
    },
    cancel: () => {
      cancelled += 1;
    },
  });

  for (let index = 0; index < 120; index += 1) buffer.appendContent("字");
  buffer.appendReasoning("正在整理");
  assert.equal(frames.length, 0, "provider token 不应逐个触发 React 帧");
  assert.equal(scheduledDelay, STREAM_RENDER_INTERVAL_MS);
  assert.ok(scheduled, "首个 token 应安排一个合并帧");
  (scheduled as () => void)();
  assert.equal(frames.length, 1, "同一时间窗内的 token 只发布一次");
  assert.equal(frames[0].content.length, 120);
  assert.equal(frames[0].reasoning, "正在整理");

  buffer.appendContent("。");
  const final = buffer.flush();
  assert.equal(cancelled, 1, "完成时应取消尚未执行的计时器");
  assert.equal(frames.length, 2, "flush 应立即发布最后一个未显示帧");
  assert.equal(final.content, `${"字".repeat(120)}。`);
}

/**
 * 封段：时间线要的是「这一段」，复制要的是「全文」，两者必须同时成立。
 */
function testStreamingBufferSeal() {
  const frames: { content: string; tail: string }[] = [];
  const buffer = createStreamingTextBuffer({
    onFrame: (snapshot) =>
      frames.push({ content: snapshot.content, tail: snapshot.tail }),
    schedule: (callback) => {
      callback();
      return {} as ReturnType<typeof setTimeout>;
    },
    cancel: () => {},
  });

  buffer.appendContent("我先去查一下 JD。");
  assert.equal(buffer.sealContent(), "我先去查一下 JD。", "封段返回本段");
  assert.equal(
    buffer.sealContent(),
    "",
    "连着封两次不该把同一段再吐一遍——那会造出一个重复的空转节拍",
  );

  /*
   * 封段之后**发出去的那一帧**里 tail 必须已经空了。
   *
   * 这条是补的：原来只断言返回值与事后 snapshot，而 bug 藏在帧里——先用封口前的快照
   * 落帧、再推进封口位，overlay 就留着一条陈旧的 tail。工具执行期间模型不产字、不会有
   * 新帧来覆盖它，于是同一句话在工具行前后各渲染一遍（时间线一份、overlay 一份）。
   */
  assert.equal(
    frames.at(-1)?.tail,
    "",
    "封段后必须再落一帧把 tail 清空，否则这段文字会同时留在时间线和 overlay 里",
  );
  assert.equal(
    frames.at(-1)?.content,
    "我先去查一下 JD。",
    "清 tail 不能顺手把全文也清了——复制/重新生成读的是 content",
  );

  buffer.appendContent("查完了，三处差距。");
  const snap = buffer.snapshot();
  assert.equal(snap.tail, "查完了，三处差距。", "tail 只含未封段的部分");
  assert.equal(
    snap.content,
    "我先去查一下 JD。查完了，三处差距。",
    "content 始终是全文：封段不能把复制/重新生成读的那份切碎",
  );
}

function testInterviewTurnMerge() {
  const opening = "欢迎来到字节跳动前端开发工程师（校招）岗位的模拟面试。";

  // 开场白两边都有：服务端 `start` 返回它，worker 再把同一段念出来、转写送回来。
  assert.deepEqual(
    mergeInterviewTurns(
      [{ role: "interviewer", text: opening }],
      [{ role: "interviewer", text: opening, segmentId: "seg-1" }],
    ),
    [{ role: "interviewer", text: opening, segmentId: "seg-1" }],
    "开场白只能出现一次——留带 segmentId 的那条，补发的定稿要靠它认领",
  );

  // 只比对接缝。面试官在一场里重复追问同一句是正常的（中间隔着你的回答），
  // 往深了比会把那种催问也吃掉。
  const merged = mergeInterviewTurns(
    [
      { role: "interviewer", text: "说说这个项目" },
      { role: "candidate", text: "嗯……" },
    ],
    [{ role: "interviewer", text: "说说这个项目" }],
  );
  assert.equal(
    merged.length,
    3,
    "隔着回答的重复追问必须保留，那是催问不是重复",
  );

  assert.deepEqual(
    mergeInterviewTurns([], [{ role: "interviewer", text: opening }]),
    [{ role: "interviewer", text: opening }],
    "任一侧为空时原样拼接",
  );

  // 同样的文字但说话人不同（你复述了面试官的问题）不该被当成重复。
  assert.equal(
    mergeInterviewTurns(
      [{ role: "candidate", text: opening }],
      [{ role: "interviewer", text: opening }],
    ).length,
    2,
    "说话人不同就不是同一句话",
  );
}

function testCaptionPacing() {
  // 面试官整句一次性到达（框架的英文分词对中文失效，就是这么来的），
  // 一帧只能吐出这一帧该吐的量——不能整块放出去跑到声音前面。
  const oneFrame = nextShownChars(0, 40, 1 / 60);
  assert.ok(
    oneFrame > 0 && oneFrame < 1,
    `一帧(16ms)只该吐不到一个字，实际 ${oneFrame}`,
  );

  // 一秒该吐 CHARS_PER_SECOND 个字。这个值是实测我们那把音色的语速（5.2-5.6 字/秒）。
  assert.equal(
    nextShownChars(0, 100, 1),
    CHARS_PER_SECOND,
    "配速必须等于实测语速，快了字就跑到声音前面",
  );

  // 已经追平就不动，别越过已收到的文本。
  assert.equal(nextShownChars(20, 20, 1), 20, "追平后不再前进");
  assert.equal(nextShownChars(0, 3, 1), 3, "不能越过已收到的字数");

  // **整句先到是常态。** 无论一次到达多少字，一帧仍然只吐一帧的量——
  // 曾经加过「落后太多就跳着追」的上限，那会让 40-50 字的正常句子每次跳掉大半。
  assert.equal(
    nextShownChars(0, 200, 1 / 60),
    nextShownChars(0, 40, 1 / 60),
    "一帧吐多少与整句多长无关，否则长句会被瞬间放出去",
  );

  // 「还没开口」与「已经念完」都是 active=false，但含义相反。
  //
  // 文本永远先于音频到达（LLM 出字 → TTS 合成 → 才响），所以开口前必然有一段
  // active=false 且文本已满的窗口。把它当成「念完了」就会整句一次性吐出，
  // 然后才开始念——这正是线上看到的症状，而它不会报任何错。
  assert.equal(
    nextStage("waiting", false),
    "waiting",
    "还没出声就得继续等，当成「念完」会让字幕整句蹦出来",
  );
  assert.equal(nextStage("waiting", true), "running", "出声即开跑");
  assert.equal(nextStage("running", false), "done", "停声即收尾");
  assert.equal(nextStage("done", false), "done", "收完了不回头");
  assert.equal(nextStage("done", true), "running", "同一段又出声则继续跑");
}

/**
 * GenUI 卡片的落点与裁决。
 *
 * 线上故障：模板复刻改了第二版，模型说「预览卡已发出」，用户在对话底部什么都看不到。
 * 原因是同一个 widgetId 的旧卡已经被「应用」（终态），新版本仍被原地塞进那张卡里——
 * 落在很久以前那一轮、按钮还不可点。
 */
function testWidgetPlacement() {
  const envelope = (props: Record<string, unknown>) => ({
    kind: "template_replica",
    props,
  });
  const nextId = (() => {
    let n = 0;
    return () => `m${(n += 1)}`;
  })();

  // 还 pending 的卡：原地更新，不堆第二张。
  const pending: ChatMessage[] = [
    {
      id: "a",
      role: "widget",
      widget: {
        widgetId: "template-replica",
        kind: "template_replica",
        props: { template: { v: 1 } },
        status: "pending",
      },
    },
  ];
  const updated = upsertWidgetInMessages(
    pending,
    "template-replica",
    envelope({ template: { v: 2 } }),
    undefined,
    nextId,
  );
  assert.equal(updated.length, 1, "改版应更新同一张卡，而不是堆出两张");
  assert.deepEqual(updated[0].widget?.props, { template: { v: 2 } });

  // 已应用的卡：这是另一个提案了，必须发新卡，且旧卡原样保留。
  const applied: ChatMessage[] = [
    {
      id: "a",
      role: "widget",
      widget: {
        widgetId: "template-replica",
        kind: "template_replica",
        props: { template: { v: 1 } },
        status: "submitted",
      },
    },
  ];
  const afterApply = upsertWidgetInMessages(
    applied,
    "template-replica",
    envelope({ template: { v: 2 } }),
    undefined,
    nextId,
  );
  assert.equal(
    afterApply.length,
    2,
    "裁决过的卡不能被复用，否则新版本无处可见",
  );
  assert.equal(afterApply[0].widget?.status, "submitted", "旧卡保持已应用");
  assert.deepEqual(afterApply[0].widget?.props, { template: { v: 1 } });
  assert.equal(afterApply[1].widget?.status, "pending", "新卡可点");
  assert.deepEqual(afterApply[1].widget?.props, { template: { v: 2 } });

  // 裁决只落在 pending 的那张：取消新卡不能把旧卡改写成已取消。
  const settled = settleWidgetInMessages(
    afterApply,
    "template-replica",
    "cancelled",
  );
  assert.equal(
    settled[0].widget?.status,
    "submitted",
    "不得回头篡改已应用的那张",
  );
  assert.equal(settled[1].widget?.status, "cancelled");
}

// 有状态的卡用固定 widgetId，「改一次面板」原本总是回去更新十几轮之前那张——
// 用户在最新回复里什么都看不到。跨轮时必须**搬过来**，且全流程仍只有一张。
{
  const older: ChatMessage[] = [
    {
      id: "m1",
      role: "assistant",
      timeline: [
        {
          kind: "widget",
          id: "board",
          widget: {
            widgetId: "board",
            kind: "application_tracker",
            props: { applications: [{ id: "a" }] },
            status: "pending",
          },
        },
      ],
    } as ChatMessage,
    { id: "m2", role: "assistant", content: "" } as ChatMessage,
  ];
  const moved = upsertWidgetInMessages(
    older,
    "board",
    {
      kind: "application_tracker",
      props: { applications: [{ id: "a" }, { id: "b" }] },
    },
    "m2",
    () => "new",
  );
  assert.equal(
    moved[0].timeline?.some((b) => b.kind === "widget"),
    false,
    "旧位置要摘干净，不能留下一张空壳",
  );
  const relocated = moved[1].timeline?.find((b) => b.kind === "widget");
  assert.ok(relocated, "卡片应落在最新这一轮");
  assert.equal(moved.length, 2, "搬家不是复制——不该多出一条消息");

  // 同一轮内再推一次是就地更新，不该把自己搬走再插回去。
  const again = upsertWidgetInMessages(
    moved,
    "board",
    { kind: "application_tracker", props: { applications: [] } },
    "m2",
    () => "new2",
  );
  assert.equal(again.length, 2);
  assert.equal(
    again[1].timeline?.filter((b) => b.kind === "widget").length,
    1,
    "同一轮不该堆出两张",
  );
}

function testPackedTrajectoryRanges() {
  const { totalActiveMs, ranges } = packTrajectoryRanges(
    [
      { startedAt: 1_000, completedAt: 2_000, steps: [] },
      // 两轮之间隔了十分钟；空闲时间不能进入 Duration 或压缩真正执行的片段。
      { startedAt: 602_000, completedAt: 604_000, steps: [] },
    ],
    604_000,
  );

  assert.equal(totalActiveMs, 3_000, "总时长只累计每轮活跃执行时间");
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].leftPct, 0);
  assert.ok(ranges[0].widthPct > 30 && ranges[0].widthPct < 34);
  assert.ok(
    ranges[1].leftPct > ranges[0].leftPct + ranges[0].widthPct,
    "轮次之间应保留一段稳定的小间隔",
  );
  assert.ok(Math.abs(ranges[1].leftPct + ranges[1].widthPct - 100) < 1e-9);
}

/**
 * `@font-face` 的 font-weight 区间不能写在只有一个文件的字体上。
 *
 * `font-weight: 400 900` 读起来像「这一档能撑起 400 到 900」,实际是告诉浏览器
 * **这一个 face 就是那整段区间**——于是请求 900 时精确命中它,浏览器认为已经拿到
 * 900 了,再也不会合成粗体。四款只有 Regular 的 CJK 字体曾经全这么写,后果是简历
 * 富文本里的 `<strong>` 与正文逐像素相同(`.wysiwyg strong` 的 900 完全失效)。
 * 只有真的备了粗体文件,才配得上第二档 `700 900`。
 */
function testFontFaceWeightRanges() {
  const css = readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), "app/globals.css"),
    "utf8",
  );

  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
    ([, body]) => ({
      family: /font-family:\s*"([^"]+)"/.exec(body)?.[1] ?? "",
      style: /font-style:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? "normal",
      weight: /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? "400",
    }),
  );
  assert.ok(faces.length > 20, "应当解析到全部 @font-face");

  const byFamily = new Map<string, string[]>();
  for (const face of faces) {
    // 字体选择器的微型子集(`X Preview`)只用来画字体名,永远不会被加粗。
    if (
      !face.family ||
      face.family.endsWith("Preview") ||
      face.style !== "normal"
    )
      continue;
    byFamily.set(face.family, [
      ...(byFamily.get(face.family) ?? []),
      face.weight,
    ]);
  }

  for (const [family, weights] of byFamily) {
    if (weights.length === 1) {
      assert.ok(
        !weights[0].includes(" "),
        `${family} 只有一个字重文件,font-weight 必须写成单值(现在是 "${weights[0]}")` +
          "——写成区间会让浏览器停止合成粗体,<strong> 就不粗了",
      );
      continue;
    }
    assert.ok(
      weights.some((weight) => weight.startsWith("700")),
      `${family} 有多个字重文件,其中一档应当注册成 700 起的粗体`,
    );
  }
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
  testCitationSources();
  testAfterAuthUrl();
  testImportedItemIds();
  testResumeMigrations();
  testCustomSections();
  testSectionOwnership();
  testSectionOrderCoercion();
  testErrorCopyCoverage();
  testErrorNormalize();
  testErrorCopy();
  testBffErrorProjection();
  testTasksCard();
  testMarkdownSource();
  testInterruptPlan();
  testAnalysisImprovementActions();
  testAgentToolVerbCoverage();
  testAgentCapabilityWidgets();
  testStreamingTextBuffer();
  testStreamingBufferSeal();
  testInterviewTurnMerge();
  testCaptionPacing();
  testWidgetPlacement();
  testPackedTrajectoryRanges();
  testFontFaceWeightRanges();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
