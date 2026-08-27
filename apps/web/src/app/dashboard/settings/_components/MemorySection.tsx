"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from '@magic-resume/icons';
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { memoryApi, type MemoryEntry, type MemoryKind } from "@/lib/api/memoryApi";

/**
 * 「AI 记得什么」。
 *
 * 这不是一个设置项，是一份**可审计的档案**——模型抽错一条事实后，之后每轮都基于它回答，
 * 而用户既看不到也改不了。**这个界面就是那条风险的解药**，所以它与抽取同期上线。
 *
 * 设计见 Magic-Core `docs/specs/ai-memory-settings/design.md`。
 */

/** 与服务端的召回门槛同值：低于它的记忆不再进 prompt。 */
const RECALL_FLOOR = 0.25;

const GROUP_ORDER: MemoryKind[] = ["profile", "pref", "signal"];

export function MemorySection() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [list, settings] = await Promise.all([
        memoryApi.list(),
        memoryApi.getSettings(),
      ]);
      setEntries(list);
      setEnabled(settings.enabled);
    } catch {
      setFailed(true);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    // 乐观：开关要立刻动。失败了再翻回去——比转半秒圈再动要好得多。
    setEnabled(next);
    await memoryApi.setEnabled(next).catch(() => setEnabled(!next));
  };

  const forget = async (entry: MemoryEntry) => {
    setConfirming(null);
    setEntries((prev) => (prev ?? []).filter((e) => e.key !== entry.key));
    await memoryApi.forget(entry.kind, entry.key).catch(() => undefined);
  };

  const forgetAll = async () => {
    setConfirmingAll(false);
    setEntries([]);
    await memoryApi.forgetAll().catch(() => undefined);
  };

  return (
    <div className="mt-7">
      <div className="flex items-start gap-6 border-y border-white/[0.06] py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-neutral-200">
            {t("settings.memory.enabled")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
            {t("settings.memory.enabledDescription")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("settings.memory.enabled")}
          onClick={() => void toggle(!enabled)}
          className={cn(
            "mt-1 h-[22px] w-[38px] shrink-0 rounded-full p-[3px] transition-colors cursor-pointer",
            enabled ? "bg-sky-500/80" : "bg-white/[0.12]",
          )}
        >
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className={cn(
              "block h-4 w-4 rounded-full bg-white",
              enabled ? "ml-auto" : "mr-auto",
            )}
          />
        </button>
      </div>

      {failed && (
        <div className="mt-6 flex items-center gap-3 text-[13px] text-neutral-400">
          {t("settings.memory.loadFailed")}
          <button
            type="button"
            onClick={() => void load()}
            className="text-sky-400 transition-colors hover:text-sky-300 cursor-pointer"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!failed && entries === null && <Skeleton />}

      {!failed && entries?.length === 0 && (
        <p className="mt-8 text-[13px] leading-relaxed text-neutral-500">
          {t("settings.memory.empty")}
        </p>
      )}

      {/* 关掉时整体变灰，并说清「保留着」——关闭不等于删除，这句话要写出来，
        否则用户不敢关。 */}
      {!!entries?.length && (
        <div className={cn("mt-2", !enabled && "opacity-45")}>
          {!enabled && (
            <p className="mt-6 text-[12.5px] leading-relaxed text-neutral-500">
              {t("settings.memory.disabledNotice")}
            </p>
          )}

          {GROUP_ORDER.map((kind) => {
            const group = entries.filter((e) => e.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind} className="mt-7">
                <h4 className="text-[12px] font-medium text-neutral-400">
                  {t(`settings.memory.group.${kind}`)}
                </h4>
                <ul className="mt-2 space-y-0.5">
                  <AnimatePresence initial={false}>
                    {group.map((entry) => (
                      <MemoryRow
                        key={entry.key}
                        entry={entry}
                        confirming={confirming === entry.key}
                        onAsk={() => setConfirming(entry.key)}
                        onCancel={() => setConfirming(null)}
                        onConfirm={() => void forget(entry)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            );
          })}

          <div className="mt-8 flex justify-end">
            {confirmingAll ? (
              <div className="flex items-center gap-3">
                <span className="text-[12.5px] text-neutral-400">
                  {t("settings.memory.confirmForgetAll", {
                    count: entries.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingAll(false)}
                  className="text-[12.5px] text-neutral-400 transition-colors hover:text-white cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void forgetAll()}
                  className="text-[12.5px] text-rose-400 transition-colors hover:text-rose-300 cursor-pointer"
                >
                  {t("settings.memory.forgetAll")}
                </button>
              </div>
            ) : (
              // 低强调：它不该是这一页上最显眼的东西。
              <button
                type="button"
                onClick={() => setConfirmingAll(true)}
                className="text-[12.5px] text-neutral-500 transition-colors hover:text-rose-400 cursor-pointer"
              >
                {t("settings.memory.forgetAll")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryRow({
  entry,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  entry: MemoryEntry;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  // **只编码那一个会改变行为的边界**：这条 AI 现在还用不用。
  // 不做强/中/淡三档——那是把一个连续值换成三个仍要解码的词，而边界只有一个。
  const faded = entry.effective < RECALL_FLOOR;
  const fromInterview = entry.source.kind === "interview";

  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="group relative -mx-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]"
    >
      {confirming ? (
        <div className="flex items-center gap-3">
          <span className="flex-1 truncate text-[12.5px] text-neutral-400">
            {t("settings.memory.confirmDelete")}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-[12.5px] text-neutral-400 transition-colors hover:text-white cursor-pointer"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-[12.5px] text-rose-400 transition-colors hover:text-rose-300 cursor-pointer"
          >
            {t("settings.memory.delete")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 pr-7">
            <p
              className={cn(
                "min-w-0 flex-1 text-[13.5px] leading-relaxed",
                faded ? "text-neutral-500" : "text-neutral-200",
              )}
            >
              {entry.fact}
            </p>
            {faded && (
              <span
                title={t("settings.memory.fadedHint")}
                className="mt-[3px] shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-neutral-500"
              >
                {t("settings.memory.faded")}
              </span>
            )}
          </div>
          {/* 溯源不是装饰：判断「这条记错没有」的唯一依据就是回去看证据。 */}
          <p className="mt-0.5 text-[11.5px] text-neutral-600">
            {fromInterview ? (
              <a
                href={`/dashboard/interview/${entry.source.id}`}
                className="transition-colors hover:text-neutral-400"
              >
                {t("settings.memory.sourceInterview", {
                  date: formatDay(entry.source.at),
                })}
              </a>
            ) : (
              // 拒绝类记忆没有可跳的页面。**不给一个点了没反应的链接。**
              t("settings.memory.sourceCanvas")
            )}
          </p>
          <button
            type="button"
            aria-label={t("settings.memory.delete")}
            onClick={onAsk}
            className="absolute right-1 top-2 rounded-md p-1 text-neutral-600 opacity-0 transition-opacity hover:text-rose-400 focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </motion.li>
  );
}

function Skeleton() {
  return (
    <div className="mt-8 space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-white/[0.04]"
          style={{ width: `${82 - i * 16}%` }}
        />
      ))}
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getMonth() + 1}/${d.getDate()}`;
}
