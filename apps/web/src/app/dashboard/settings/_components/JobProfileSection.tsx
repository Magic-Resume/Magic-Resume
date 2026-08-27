"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { jobProfileApi, type JobProfile } from "@/lib/api/jobProfileApi";
import { JobProfilePanel } from "./JobProfilePanel";

/**
 * 求职画像那一块。**摆在 `MemorySection` 上方，同一页**。
 *
 * 两层结构：上面这份是用户亲口说的、一直生效的一份文档；下面那些是 AI 推断的、会过时
 * 会衰减的条目。相邻而分栏本身就把差别说清楚了——分成两页反而要用文案再解释一遍
 * （brief §11a）。
 *
 * 这一行只放开关 + 一句摘要 + 「管理」，正文在面板里看。设置页是一列扫读的清单，
 * 把一份几百字的文档摊在这儿会把它下面的东西全推出视野。
 */
export function JobProfileSection() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language || "zh").toLowerCase().startsWith("en")
    ? "en"
    : "zh";
  const [profile, setProfile] = useState<JobProfile | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setProfile(await jobProfileApi.get());
    } catch {
      setFailed(true);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    if (!profile) return;
    // 乐观：开关要立刻动。失败了再翻回去——比转半秒圈再动好得多。
    setProfile({ ...profile, enabled: next });
    await jobProfileApi
      .setEnabled(next)
      .catch(() => setProfile((p) => (p ? { ...p, enabled: !next } : p)));
  };

  const enabled = profile?.enabled ?? false;
  /** 答案在库里、正文还没合成出来。**不能说「还没有画像」**——他已经填过了。 */
  const pending = profile?.status === 'pending';

  const retry = async () => {
    setFailed(false);
    setProfile(undefined);
    try {
      setProfile(await jobProfileApi.regenerate(locale));
    } catch {
      setFailed(true);
      await load();
    }
  };

  return (
    <div className="mt-7">
      <div className="flex items-start gap-6 border-y border-white/[0.06] py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-neutral-200">
            {t("settings.jobProfile.enabled")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
            {t("settings.jobProfile.enabledDescription")}
          </p>
        </div>

        {/* 没有画像、或正文还没出来时，开关无从谈起——别给一个翻了也没用的开关。 */}
        {profile && !pending ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("settings.jobProfile.enabled")}
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
        ) : null}
      </div>

      {failed && (
        <div className="mt-4 flex items-center gap-3 text-[13px] text-neutral-400">
          {t("settings.jobProfile.loadFailed")}
          <button
            type="button"
            onClick={() => void load()}
            className="text-sky-400 transition-colors hover:text-sky-300 cursor-pointer"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!failed && profile === undefined && (
        <div className="mt-4 h-9 animate-pulse rounded-lg bg-white/[0.04]" />
      )}

      {/* 还没填过。这里不弹引导——设置页是他自己来的，把人从设置里弹去一个全屏问卷
          是抢方向盘；给一条明路，走不走由他。 */}
      {!failed && profile === null && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {t("settings.jobProfile.empty")}
          </p>
          <a
            href="/onboarding"
            className="text-[13px] text-sky-400 transition-colors hover:text-sky-300"
          >
            {t("settings.jobProfile.startOnboarding")}
          </a>
        </div>
      )}

      {/* 填过了、只是正文还欠着。给一次重试，而不是让他重走一遍问卷。 */}
      {!failed && pending && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {t("settings.jobProfile.pending")}
          </p>
          <button
            type="button"
            onClick={() => void retry()}
            className="text-[13px] text-sky-400 transition-colors hover:text-sky-300"
          >
            {t("settings.jobProfile.retry")}
          </button>
        </div>
      )}

      {profile && !pending && (
        <div className={cn("mt-4", !enabled && "opacity-45")}>
          {!enabled && (
            <p className="mb-3 text-[12.5px] leading-relaxed text-neutral-500">
              {t("settings.jobProfile.disabledNotice")}
            </p>
          )}
          <div className="flex items-center gap-4 rounded-[10px] border border-white/[0.06] px-3.5 py-3">
            <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-400">
              {summarize(profile.content)}
            </p>
            {/* 「重新回答」和「…」里的「重新生成」是两件事，两个动词要区分得开：
                **回答**是换输入（转行了、换城市了），**生成**是同一份答案让模型再写
                一遍。只给后者，情况变了的人就只能眼看着一份过时的画像。 */}
            <a
              href="/onboarding"
              className="shrink-0 text-[12.5px] text-neutral-500 transition-colors hover:text-neutral-300"
            >
              {t("settings.jobProfile.redoOnboarding")}
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-full border border-white/[0.12] px-3 py-1 text-[12.5px] text-neutral-300 transition-colors hover:border-white/25 hover:text-neutral-100"
            >
              {t("settings.jobProfile.manage")}
            </button>
          </div>
        </div>
      )}

      {profile && !pending && (
        <JobProfilePanel
          open={open}
          onOpenChange={setOpen}
          profile={profile}
          onChanged={setProfile}
          onDeleted={() => {
            setProfile(null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** 摘要 = 正文第一句实话。跳过小节标题与「（暂无）」——那两样什么都没说。 */
function summarize(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^（暂无）$|^\(none yet\)$/.test(line)) continue;
    return line;
  }
  return content.trim().slice(0, 80);
}
