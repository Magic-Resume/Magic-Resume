"use client";

import React, { useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  DotsHorizontalIcon,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "@magic-resume/icons";
import { cn } from "@/lib/utils";
import Markdown from "@/app/dashboard/edit/_components/ai/conversation/Markdown";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { jobProfileApi, type JobProfile } from "@/lib/api/jobProfileApi";

/**
 * 求职画像面板。
 *
 * 设计见 `docs/specs/onboarding-and-auth/brief.md` §11b/§11c。两条要紧的：
 *
 * 1. **改画像靠说一句话，不是编辑 markdown。** 没有人想编辑「第 2 小节第 3 行」，
 *    他脑子里的原话是「我不去杭州了」。
 * 2. **改动先给 diff 再落。** 这份文档每一轮都注进 prompt，写坏了污染的是此后所有
 *    对话而不是一次回答——所以这里比别处更该先看后落（设计原则 ③）。
 */

const EASE = [0.22, 0.61, 0.25, 1] as const;

export function JobProfilePanel({
  open,
  onOpenChange,
  profile,
  onChanged,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  profile: JobProfile;
  onChanged: (next: JobProfile) => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language || "zh").toLowerCase().startsWith("en") ? "en" : "zh";

  const [instruction, setInstruction] = useState("");
  /** 候选正文。非 null = 正在给用户看 diff，还没落库。 */
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "save" | "regenerate">(null);
  const [error, setError] = useState(false);
  /**
   * 删除要二次确认。**不可逆，而且代价不在当下**——画像没了，此后每一轮对话都退回
   * 通用建议，而那时他早就忘了自己点过这个菜单项。菜单里一次误点就够。
   *
   * 没用仓库那个共享 `ConfirmDialog`：它的层级是为 AI Lab 写死的 `z-150`，而这块面板
   * 本身在 `z-201`——挂上去只会被自己要确认的东西盖住。这里自带 portal 叠到 210/211，
   * 与 `LegalDocDialog` 叠在条款框之上是同一套做法。
   */
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(
    () => (draft === null ? null : diffLines(profile.content, draft)),
    [draft, profile.content],
  );

  const requestDraft = useCallback(async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy("draft");
    setError(false);
    try {
      const next = await jobProfileApi.draft(text, locale);
      setDraft(next.content);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }, [busy, instruction, locale]);

  const apply = useCallback(async () => {
    if (draft === null) return;
    setBusy("save");
    try {
      onChanged(await jobProfileApi.save(draft));
      setDraft(null);
      setInstruction("");
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }, [draft, onChanged]);

  const regenerate = useCallback(async () => {
    setBusy("regenerate");
    setError(false);
    try {
      onChanged(await jobProfileApi.regenerate(locale));
      setDraft(null);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }, [locale, onChanged]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed left-1/2 top-1/2 z-[201] flex h-[min(76vh,720px)] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-hairline bg-raised shadow-overlay outline-none"
          >
            {/* ── 抬头：标题 · 更新时间 · 更多 · 关闭 ─────────── */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-5 py-3.5">
              <Dialog.Title className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                {t("settings.jobProfile.title")}
              </Dialog.Title>
              {/* 「多久之前更新」是用户唯一能据以判断「AI 现在到底懂不懂我」的线索。 */}
              <span className="truncate text-[12px] text-[color:var(--text-muted)]">
                {updatedLabel(profile.updatedAt, locale, t)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    aria-label={t("settings.jobProfile.more")}
                    className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--text-muted)] transition-colors hover:bg-sunk hover:text-[color:var(--text-secondary)]"
                  >
                    <DotsHorizontalIcon className="h-4 w-4" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    {/* 重新生成与删除都低频且不可逆，收进菜单——不该和日常动作同一层。 */}
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      className="z-[202] min-w-[176px] rounded-[10px] border border-hairline bg-raised p-1 shadow-overlay"
                    >
                      <DropdownMenu.Item
                        onSelect={() => void regenerate()}
                        className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[color:var(--text-secondary)] outline-none transition-colors data-[highlighted]:bg-sunk data-[highlighted]:text-[color:var(--text-primary)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("settings.jobProfile.regenerate")}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={() => setConfirmDelete(true)}
                        className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[color:var(--rev-del)] outline-none transition-colors data-[highlighted]:bg-sunk"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("settings.jobProfile.delete")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <Dialog.Close
                  aria-label={t("auth.terms.close")}
                  className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--text-muted)] transition-colors hover:bg-sunk hover:text-[color:var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {/* ── 正文 / diff ───────────────────────────────── */}
            <div className="min-h-0 flex-auto overflow-y-auto px-5 py-4">
              {rows ? (
                <div className="font-mono text-[12.5px] leading-relaxed">
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className={cn(
                        "whitespace-pre-wrap rounded px-2 py-0.5",
                        row.kind === "add" &&
                          "bg-[color:var(--rev-add)]/12 text-[color:var(--rev-add)]",
                        row.kind === "del" &&
                          "bg-[color:var(--rev-del)]/12 text-[color:var(--rev-del)] line-through",
                        row.kind === "same" && "text-[color:var(--text-muted)]",
                      )}
                    >
                      {row.text || " "}
                    </div>
                  ))}
                </div>
              ) : (
                <Markdown>{profile.content}</Markdown>
              )}
            </div>

            {/* ── 底栏：说一句话改它 / 应用·放弃 ──────────────── */}
            <div className="shrink-0 border-t border-hairline px-5 py-3.5">
              {error && (
                <p role="alert" className="mb-2 text-[12.5px] text-[color:var(--rev-del)]">
                  {t("settings.jobProfile.failed")}
                </p>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {rows ? (
                  <motion.div
                    key="review"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    // 不写「这是改完的样子」——红删绿增就摆在上面，那句话只是把眼睛
                    // 已经看到的事再说一遍。
                    className="flex items-center justify-end gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="rounded-[9px] px-3 py-1.5 text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-sunk"
                    >
                      {t("settings.jobProfile.discard")}
                    </button>
                    <button
                      type="button"
                      disabled={busy === "save"}
                      onClick={() => void apply()}
                      className="rounded-[9px] bg-fill-sky px-3 py-1.5 text-[13px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
                    >
                      {t("settings.jobProfile.apply")}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="compose"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative"
                  >
                    <input
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          void requestDraft();
                        }
                      }}
                      // 占位符写「说一句话改它」而不是「提问」：旁边就是 Polaris，
                      // 再放一个会话入口是两个对话框打架。这个框只改画像。
                      placeholder={t("settings.jobProfile.revisePlaceholder")}
                      className="h-10 w-full rounded-[10px] border border-hairline bg-sunk pl-3.5 pr-11 text-[13px] text-[color:var(--text-primary)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-ink-sky"
                    />
                    <button
                      type="button"
                      aria-label={t("settings.jobProfile.revise")}
                      disabled={!instruction.trim() || busy !== null}
                      onClick={() => void requestDraft()}
                      className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-fill-sky text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>

      <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[210] bg-black/55 backdrop-blur-[2px]" />
          <AlertDialog.Content asChild>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="fixed left-1/2 top-1/2 z-[211] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-hairline bg-raised p-5 shadow-overlay outline-none"
            >
              <AlertDialog.Title className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {t("settings.jobProfile.deleteConfirmTitle")}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2.5 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
                {t("settings.jobProfile.deleteConfirmBody")}
              </AlertDialog.Description>
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Cancel className="rounded-[9px] px-3.5 py-2 text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-sunk">
                  {t("common.cancel")}
                </AlertDialog.Cancel>
                <AlertDialog.Action
                  onClick={() => {
                    void jobProfileApi.remove().catch(() => undefined);
                    onDeleted();
                  }}
                  className="rounded-[9px] bg-[color:var(--rev-del)] px-3.5 py-2 text-[13px] font-medium text-white transition-[filter] hover:brightness-110"
                >
                  {t("settings.jobProfile.delete")}
                </AlertDialog.Action>
              </div>
            </motion.div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */

type DiffRow = { kind: "same" | "add" | "del"; text: string };

/**
 * 逐行 diff（LCS）。
 *
 * 自己写而不是引一个库：这是整个前端唯一用得上 diff 的地方，为一屏加一个依赖不划算，
 * 而按行比对本身就是教科书上的最长公共子序列。画像是几十行的短文档，O(n·m) 完全够用。
 */
function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      rows.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) rows.push({ kind: "del", text: a[i++] });
  while (j < b.length) rows.push({ kind: "add", text: b[j++] });
  return rows;
}

/**
 * 「刚刚更新 / 3 天前更新」。
 *
 * 用 `Intl.RelativeTimeFormat` 而不是仓库里那个 `formatRelativeTime`——后者只出英文
 * （`3d ago`），挂在中文界面上就是一处夹生。
 */
function updatedLabel(
  iso: string,
  locale: string,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) {
    return t("settings.jobProfile.updatedJustNow");
  }
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return t("settings.jobProfile.updated", {
        when: rtf.format(-Math.floor(seconds / size), unit),
      });
    }
  }
  return t("settings.jobProfile.updatedJustNow");
}
