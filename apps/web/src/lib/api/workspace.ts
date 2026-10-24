import { httpClient, type ApiResponse } from "./httpClient";
import { API_ROUTES } from "./routes";

export type WorkspaceChangeAction = "INSERT" | "REMOVE" | "REPLACE" | "REORDER";
export type WorkspaceChangeStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CONFLICTED";

export type WorkspaceChangeTarget =
  | { scope: "document"; fieldKey: "documentLanguage" }
  | { scope: "info"; fieldKey: string }
  | {
      scope: "sectionItem";
      sectionKey: string;
      itemId: string;
      fieldKey: string;
    }
  | { scope: "section"; sectionKey: string; itemId: string }
  | { scope: "sectionOrder" };

export type WorkspaceProposalChange = {
  id: string;
  clientKey: string;
  ordinal: number;
  action: WorkspaceChangeAction;
  target: WorkspaceChangeTarget;
  beforeHash: string;
  afterHash: string;
  after?: unknown;
  status: WorkspaceChangeStatus;
};

export type WorkspaceProposal = {
  id: string;
  workspaceId: string;
  resumeId: string;
  runId: string;
  kind: string;
  status: string;
  baseRevision: number;
  baseResume: Record<string, unknown>;
  candidateResume: Record<string, unknown>;
  changes: WorkspaceProposalChange[];
};

export type WorkspacePreparedChange = Omit<
  WorkspaceProposalChange,
  "id" | "afterHash" | "status"
> & {
  after?: unknown;
};

export type WorkspaceResolution = {
  proposalId: string;
  status: string;
  accepted: string[];
  rejected: string[];
  conflicts: Array<{
    changeId: string;
    target: WorkspaceChangeTarget;
    currentHash: string;
  }>;
  resume: Record<string, unknown>;
  revision: number;
};

/** Platform owns proposal persistence, validation, CAS, and final resume writes. */
export const workspaceApi = {
  async getProposal(
    resumeId: string,
    proposalId: string,
  ): Promise<WorkspaceProposal> {
    const response = await httpClient.api.get<ApiResponse<WorkspaceProposal>>(
      API_ROUTES.resumes.workspaceProposal(resumeId, proposalId),
    );
    return response.data.data;
  },

  async prepare(
    resumeId: string,
    proposalId: string,
    changes: WorkspacePreparedChange[],
  ): Promise<WorkspaceProposal> {
    const response = await httpClient.api.post<ApiResponse<WorkspaceProposal>>(
      API_ROUTES.resumes.workspacePrepare(resumeId, proposalId),
      { changes },
    );
    return response.data.data;
  },

  async resolve(
    resumeId: string,
    proposalId: string,
    decisions: { accept?: string[]; reject?: string[] },
  ): Promise<WorkspaceResolution> {
    const response = await httpClient.api.post<
      ApiResponse<WorkspaceResolution>
    >(API_ROUTES.resumes.workspaceResolve(resumeId, proposalId), decisions);
    return response.data.data;
  },

  async rejectAll(
    resumeId: string,
    proposalId: string,
  ): Promise<WorkspaceProposal> {
    const response = await httpClient.api.post<ApiResponse<WorkspaceProposal>>(
      API_ROUTES.resumes.workspaceRejectAll(resumeId, proposalId),
      {},
    );
    return response.data.data;
  },
};

/**
 * Build the browser-owned visual inventory from the encrypted base/candidate
 * pair. The API independently validates every target and hash before storing
 * it; this function never grants the browser authority to write the resume.
 */
export async function buildWorkspacePreparedChanges(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
): Promise<WorkspacePreparedChange[]> {
  const raw: Array<{
    action: WorkspaceChangeAction;
    target: WorkspaceChangeTarget;
    before: unknown;
    after?: unknown;
  }> = [];
  const baseInfo = record(base.info);
  const candidateInfo = record(candidate.info);
  for (const fieldKey of sortedKeys(baseInfo, candidateInfo)) {
    if (sameJson(baseInfo?.[fieldKey], candidateInfo?.[fieldKey])) continue;
    raw.push({
      action: "REPLACE",
      target: { scope: "info", fieldKey },
      before: baseInfo?.[fieldKey],
      after: candidateInfo?.[fieldKey],
    });
  }

  const baseSections = record(base.sections);
  const candidateSections = record(candidate.sections);
  for (const sectionKey of sortedKeys(baseSections, candidateSections)) {
    const beforeItems = Array.isArray(baseSections?.[sectionKey])
      ? (baseSections?.[sectionKey] as unknown[])
      : [];
    const afterItems = Array.isArray(candidateSections?.[sectionKey])
      ? (candidateSections?.[sectionKey] as unknown[])
      : [];
    const beforeById = byId(beforeItems);
    const afterById = byId(afterItems);
    for (const itemId of [
      ...new Set([...beforeById.keys(), ...afterById.keys()]),
    ].sort()) {
      const before = beforeById.get(itemId);
      const after = afterById.get(itemId);
      if (!before && after) {
        raw.push({
          action: "INSERT",
          target: { scope: "section", sectionKey, itemId },
          before: undefined,
          after,
        });
        continue;
      }
      if (before && !after) {
        raw.push({
          action: "REMOVE",
          target: { scope: "section", sectionKey, itemId },
          before,
        });
        continue;
      }
      if (!before || !after) continue;
      for (const fieldKey of sortedKeys(before, after).filter(
        (key) => key !== "id",
      )) {
        if (sameJson(before[fieldKey], after[fieldKey])) continue;
        raw.push({
          action: "REPLACE",
          target: { scope: "sectionItem", sectionKey, itemId, fieldKey },
          before: before[fieldKey],
          after: after[fieldKey],
        });
      }
    }
  }

  if (typeof candidate.documentLanguage === 'string' && !sameJson(base.documentLanguage, candidate.documentLanguage)) {
    raw.push({ action: 'REPLACE', target: { scope: 'document', fieldKey: 'documentLanguage' }, before: base.documentLanguage, after: candidate.documentLanguage });
  }

  if (!sameJson(base.sectionOrder, candidate.sectionOrder)) {
    raw.push({
      action: "REORDER",
      target: { scope: "sectionOrder" },
      before: base.sectionOrder,
      after: candidate.sectionOrder,
    });
  }

  return Promise.all(
    raw.map(async (change, ordinal) => ({
      clientKey: `workspace:${ordinal}`,
      ordinal,
      action: change.action,
      target: change.target,
      beforeHash: await sha256(stableStringify(change.before)),
      ...(change.action === "REMOVE" ? {} : { after: change.after }),
    })),
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function byId(items: unknown[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const object = record(item);
    if (object && typeof object.id === "string" && object.id)
      result.set(object.id, object);
  }
  return result;
}

function sortedKeys(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): string[] {
  return [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])]
    .filter((key) => /^[A-Za-z0-9_-]{1,180}$/.test(key))
    .sort();
}

function sameJson(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
