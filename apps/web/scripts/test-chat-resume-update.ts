import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the production SSE branch without mounting the editor's providers.
// This catches regressions in the UI effects, not just in the diff utility.
const source = readFileSync(
  new URL(
    "../src/app/dashboard/edit/_components/ai/AiChatShell.tsx",
    import.meta.url,
  ),
  "utf8",
);
const ast = ts.createSourceFile(
  "AiChatShell.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let handler: ts.Statement | undefined;
function visit(node: ts.Node) {
  if (ts.isIfStatement(node)) {
    const condition = node.expression.getText(ast);
    if (
      condition.includes('ev.type === "resume_patch"') &&
      condition.includes('ev.type === "resume_update"')
    ) {
      handler = node.thenStatement;
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, "production resume event branch must exist");
const code = ts.transpileModule(
  `for (const ev of events) ${handler.getText(ast)}`,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;

function replay({
  changed = 0,
  malformed = false,
  dismissed = false,
  batch = false,
} = {}) {
  const effects: string[] = [];
  const sections = { experience: { items: [] } };
  const context = {
    events: [
      {
        type: "resume_update",
        data: malformed ? {} : { sections, sectionOrder: [] },
      },
    ],
    AGENT_MODES: { general: { allowsResumeEdits: true } },
    agentModeRef: { current: "general" },
    skillBatchRunRef: { current: batch ? { kind: "optimize" } : null },
    activeSkillRef: { current: null },
    patchHandledRunIds: new Set(),
    patchHandledWithoutRunId: false,
    coerceSectionOrder: (value: unknown) => value,
    resumeData: { sections },
    diffResumeToChanges: () => Array.from({ length: changed }, () => ({})),
    canvasDismissedForRun: { current: dismissed },
    batchNonce: { current: 0 },
    changeNotes: undefined,
    CLOSED_CANVAS: {},
    warnDropped: (_message: string, reason: string) =>
      effects.push(`warn:${reason}`),
    logChange: () => effects.push("log"),
    setCanvas: () => effects.push("canvas"),
    setLivingOpen: () => effects.push("open"),
    setLivingSkillId: () => effects.push("skill"),
    setBatchRequest: () => effects.push("batch"),
  };
  vm.runInNewContext(code, context);
  return effects;
}

assert.deepEqual(
  replay(),
  [],
  "unchanged chat/interview snapshots must not warn or open the canvas",
);
assert.deepEqual(replay({ changed: 1 }), ["canvas", "open", "skill", "batch"]);
assert.deepEqual(replay({ changed: 1, dismissed: true }), ["log"]);
assert.deepEqual(replay({ malformed: true }), ["warn:malformed"]);
assert.deepEqual(replay({ batch: true }), ["canvas", "open", "skill", "batch"]);
console.log("Chat resume-update regression checks passed (5 cases).");
