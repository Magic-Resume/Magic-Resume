import { httpClient, type ApiResponse } from "./httpClient";
import { API_ROUTES } from "./routes";
import { interviewApi } from "./interviewApi";

export type WorkspaceChangeAction = "INSERT" | "REMOVE" | "REPLACE" | "REORDER";
export type WorkspaceChangeStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CONFLICTED";

export type WorkspaceChangeTarget =
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

/* ── 资产库 ──────────────────────────────────────────────────
   列表是**账号级**的（跨简历汇总），正文/归档/留住走按简历的老路由——列表已经把
   `resumeId` 带回来了。见 docs/specs/asset-library/brief.md。 */

/** 露给用户的四种。`LOGO_SET` 是版式复刻的中间产物、`HANDOFF` 是系统内部报价，
    列在资产库里只会稀释真正有用的那几条。 */
export const ASSET_TYPES = [
  "JD_RESEARCH",
  "COMPANY_PROFILE",
  "TEMPLATE",
  "COVER_LETTER",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * 资产库里另外两类**不是 WorkspaceArtifact** 的东西：投递面板与面试记录。
 *
 * 用户最早的原话就是「资产库…比如投递表格 比如面试记录这种」——他要的是一个能找到
 * 自己求职材料的地方，而不是一个「AI 产出物」目录。它们各有自己的表和寿命，所以不塞进
 * `WorkspaceArtifact`，只在这一层合流成同一张清单。
 *
 * 与产物的两点不同要一路带到界面上：**没有过期时间**（面板是活的，面试记录是归档），
 * 因此也**没有留住/归档**这两个动作。
 */
export const EXTRA_ASSET_KINDS = ['BOARD', 'INTERVIEW'] as const;
export type ExtraAssetKind = (typeof EXTRA_ASSET_KINDS)[number];

export type WorkspaceAsset = {
  id: string;
  resumeId: string;
  resumeName: string;
  type: AssetType;
  status: "READY" | "ARCHIVED";
  title: string;
  mimeType: string;
  version: number;
  sizeBytes: number;
  /** 为 null 表示已经「留住」，不再自动消失。 */
  expiresAt: string | null;
  updatedAt: string;
};

export async function listAssets(params: {
  type?: AssetType;
  resumeId?: string;
  q?: string;
} = {}): Promise<WorkspaceAsset[]> {
  const response = await httpClient.api.get<ApiResponse<WorkspaceAsset[]>>(
    API_ROUTES.resumes.workspaceArtifacts(),
    { params: { limit: 200, ...params } },
  );
  const rows = response.data?.data ?? [];
  // 归档的默认不列：它的正文后端已经不再返回，列出来只能看元信息。
  return rows.filter(
    (row) => row.status === "READY" && ASSET_TYPES.includes(row.type),
  );
}

/** 清单里的一行：要么是工作台产物，要么是上面那两类之一。 */
export type LibraryAsset = WorkspaceAsset & {
  /** 缺席 = 普通产物。有值时不显示过期/留住/归档，正文也换一套渲染。 */
  extra?: ExtraAssetKind;
  /** `extra` 那两类的正文，直接带在行上——它们没有「按 id 再读一次」的路由。 */
  payload?: unknown;
};

export type AssetContent = WorkspaceAsset & { content: unknown };

export async function readAsset(
  resumeId: string,
  artifactId: string,
): Promise<AssetContent> {
  const response = await httpClient.api.get<ApiResponse<AssetContent>>(
    API_ROUTES.resumes.workspaceArtifact(resumeId, artifactId),
  );
  return response.data.data;
}

/** 清掉过期时间。是永久留住，不是往后顺延——顺延只是把「要没了」推远一点。 */
export async function keepAsset(resumeId: string, artifactId: string) {
  await httpClient.api.post(
    API_ROUTES.resumes.workspaceArtifactKeep(resumeId, artifactId),
  );
}

/**
 * 真删除。与 `archiveAsset` 并存：**归档**是收起来、正文读不出来但还看得到存在过；
 * **删除**是整行消失。两个诉求都真实，合并成一个动作必然有一半人拿不到想要的语义。
 */
export async function deleteAsset(resumeId: string, artifactId: string) {
  await httpClient.api.delete(
    API_ROUTES.resumes.workspaceArtifactDelete(resumeId, artifactId),
  );
}

/** 清空投递面板。回删掉的数量，好让界面说清删了什么。 */
export async function clearBoard(): Promise<{
  applications: number;
  columns: number;
}> {
  const response = await httpClient.api.delete<
    ApiResponse<{ applications: number; columns: number }>
  >(API_ROUTES.jobApplications.clear);
  return response.data.data;
}

export async function archiveAsset(resumeId: string, artifactId: string) {
  await httpClient.api.post(
    API_ROUTES.resumes.workspaceArtifactArchive(resumeId, artifactId),
  );
}

/**
 * 把投递面板与面试记录取回来，折成资产库清单里的行。
 *
 * **两路各自失败、互不牵连**：面板挂了不该让面试记录也消失，反过来也一样。所以这里
 * 用 `allSettled` 而不是 `all`——一个 500 拖垮整张清单，是把小故障放大成大故障。
 */
export async function listExtraAssets(): Promise<LibraryAsset[]> {
  const [board, interviews] = await Promise.allSettled([
    httpClient.api.get<ApiResponse<{ columns: unknown[]; applications: unknown[] }>>(
      API_ROUTES.jobApplications.board,
      { params: { limit: 200 } },
    ),
    interviewApi.listSessions(),
  ]);

  const rows: LibraryAsset[] = [];

  if (board.status === 'fulfilled') {
    const payload = board.value.data?.data;
    const applications = payload?.applications ?? [];
    // 一条投递都没有就不列这一行：一块空面板不是资产，只是一个还没发生的功能。
    if (applications.length > 0) {
      rows.push({
        // 面板只有一块，id 固定。它不是「某一条投递」，而是那张表本身。
        id: 'board',
        resumeId: '',
        resumeName: '',
        type: 'JD_RESEARCH',
        extra: 'BOARD',
        status: 'READY',
        title: '',
        mimeType: 'application/json',
        version: 1,
        sizeBytes: 0,
        expiresAt: null,
        updatedAt:
          latestUpdatedAt(applications) ?? new Date().toISOString(),
        payload,
      });
    }
  }

  if (interviews.status === 'fulfilled') {
    for (const session of interviews.value) {
      rows.push({
        // 历史接口的主键叫 `id`。这里以前另造了一个 `sessionId` 类型，运行时读到
        // undefined，所有行都变成 `interview:undefined`，于是 React key 与选中态一起串了。
        id: `interview:${session.id}`,
        resumeId: '',
        resumeName: '',
        type: 'JD_RESEARCH',
        extra: 'INTERVIEW',
        status: 'READY',
        title: session.role || '',
        mimeType: 'application/json',
        version: 1,
        sizeBytes: 0,
        expiresAt: null,
        updatedAt: session.finishedAt ?? session.startedAt,
        payload: session,
      });
    }
  }

  return rows;
}

function latestUpdatedAt(rows: unknown[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    const value = (row as { updatedAt?: string })?.updatedAt;
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest;
}
