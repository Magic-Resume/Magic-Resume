"use client";

import React, { useMemo, useState } from "react";
import { Clock, Search } from "@magic-resume/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ChatMessage, MessageBeat } from "../types";
import { TrajectoryRows } from "./TrajectoryView";
import { packTrajectoryRanges } from "./trajectory";

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function searchableBeat(beat: MessageBeat): string {
  if (beat.kind === "text") return beat.text;
  if (beat.kind === "widget") return "";
  return [
    beat.call.toolName,
    beat.call.subject,
    beat.call.summary?.subject,
    beat.call.summary?.name,
    beat.call.error,
  ]
    .filter(Boolean)
    .join(" ");
}

/** 整场会话的 Harness 式轨迹页；聊天内容与轨迹共享同一份持久化消息。 */
export default function ConversationTrajectory({
  messages,
}: {
  messages: ChatMessage[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const turns = useMemo(
    () =>
      messages
        .map((message, messageIndex) => ({ message, messageIndex }))
        .filter(
          ({ message }) =>
            message.role === "assistant" && message.trajectory?.steps.length,
        ),
    [messages],
  );
  const trajectories = turns.flatMap(({ message }) =>
    message.trajectory ? [message.trajectory] : [],
  );
  const now = Date.now();
  const { totalActiveMs, ranges } = packTrajectoryRanges(trajectories, now);
  const allBeats = turns.flatMap(({ message }) => message.timeline ?? []);
  const calls = allBeats.filter((beat) => beat.kind === "tool").length;
  const steps = trajectories.reduce(
    (count, trajectory) => count + trajectory.steps.length,
    0,
  );

  const segmentStyle = (turnIndex: number, start: number, end?: number) => {
    const trajectory = trajectories[turnIndex];
    const range = ranges[turnIndex];
    if (!trajectory || !range) return undefined;

    const localStart = Math.max(
      0,
      Math.min(1, (start - trajectory.startedAt) / range.durationMs),
    );
    const localEnd = Math.max(
      localStart,
      Math.min(1, ((end ?? now) - trajectory.startedAt) / range.durationMs),
    );
    const left = range.leftPct + localStart * range.widthPct;
    const availableWidth = range.leftPct + range.widthPct - left;
    const width = Math.min(
      availableWidth,
      Math.max(0.45, (localEnd - localStart) * range.widthPct),
    );
    return {
      left: `${left}%`,
      width: `${Math.max(0, width)}%`,
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-950/35">
      <div className="shrink-0 bg-white/[0.018] px-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 py-2.5 font-mono text-[11px] tabular-nums text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={11} />
            {formatDuration(totalActiveMs)}
          </span>
          <span>{t("aiLab.trajectory.turns", { count: turns.length })}</span>
          <span>{t("aiLab.trajectory.steps", { count: steps })}</span>
          <span>{t("aiLab.trajectory.calls", { count: calls })}</span>
          <label className="ml-auto flex h-7 w-48 items-center gap-2 rounded-md border border-white/[0.09] bg-white/[0.035] px-2 text-neutral-500 focus-within:border-white/[0.16]">
            <Search size={12} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("aiLab.trajectory.search")}
              className="min-w-0 flex-1 bg-transparent font-sans text-[12px] text-neutral-300 outline-none placeholder:text-neutral-600"
            />
          </label>
        </div>
      </div>

      {turns.length ? (
        <>
          <div className="shrink-0 px-4">
            <div className="mx-auto w-full max-w-3xl py-2.5">
              <GlobalLane label={t("aiLab.trajectory.lanes.input")}>
                {turns.map(({ message }, turnIndex) => {
                  const trajectory = message.trajectory!;
                  const firstModelAt = trajectory.steps[0]?.startedAt;
                  return firstModelAt ? (
                    <span
                      key={`input:${message.id}`}
                      className="absolute inset-y-0 rounded-[2px] bg-sky-400/80"
                      style={segmentStyle(
                        turnIndex,
                        trajectory.startedAt,
                        firstModelAt,
                      )}
                    />
                  ) : null;
                })}
              </GlobalLane>
              <GlobalLane label={t("aiLab.trajectory.lanes.model")}>
                {turns.flatMap(({ message }, turnIndex) =>
                  (message.trajectory?.steps ?? []).map((step) => (
                    <span
                      key={`${message.id}:${step.id}`}
                      className="absolute inset-y-0 rounded-[2px] bg-violet-400/80"
                      style={segmentStyle(
                        turnIndex,
                        step.startedAt,
                        step.completedAt,
                      )}
                    />
                  )),
                )}
              </GlobalLane>
              <GlobalLane label={t("aiLab.trajectory.lanes.tools")}>
                {turns.flatMap(({ message }, turnIndex) =>
                  (message.timeline ?? []).map((beat) =>
                    beat.kind === "tool" && beat.call.startedAt ? (
                      <span
                        key={`${message.id}:${beat.id}`}
                        className={cn(
                          "absolute inset-y-0 rounded-[2px]",
                          beat.call.error ? "bg-red-400/85" : "bg-amber-400/85",
                        )}
                        style={segmentStyle(
                          turnIndex,
                          beat.call.startedAt,
                          beat.call.completedAt,
                        )}
                      />
                    ) : null,
                  ),
                )}
              </GlobalLane>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 pb-24">
            <div className="mx-auto w-full max-w-3xl">
              {turns.map(({ message, messageIndex }, turnIndex) => {
              const beats = (message.timeline ?? []).filter(
                (beat) =>
                  beat.kind !== "widget" &&
                  (!needle || searchableBeat(beat).toLowerCase().includes(needle)),
              );
              const previousUser = [...messages.slice(0, messageIndex)]
                .reverse()
                .find((item) => item.role === "user");
              const userMatches =
                !needle ||
                (previousUser?.content ?? "").toLowerCase().includes(needle);
              if (!beats.length && !userMatches) return null;
              return (
                <section key={message.id} className="relative pt-5">
                  <div className="absolute left-0 top-1 rounded-sm bg-white/[0.045] px-1.5 py-0.5 font-mono text-[9px] leading-none text-neutral-600">
                    {t("aiLab.trajectory.turn", { count: turnIndex + 1 })}
                  </div>
                  {previousUser?.content && userMatches ? (
                    <div className="grid min-w-0 grid-cols-[68px_minmax(0,1fr)] items-center gap-2 border-b border-white/[0.045] px-3 py-1.5 font-mono text-[10px] leading-4">
                      <span className="w-fit rounded bg-sky-400/10 px-1.5 py-0.5 text-[9px] text-sky-300">
                        {t("aiLab.trajectory.actor.user")}
                      </span>
                      <span className="truncate text-neutral-400">
                        {previousUser.content.replace(/\s+/g, " ")}
                      </span>
                    </div>
                  ) : null}
                  {message.trajectory ? (
                    <TrajectoryRows
                      trajectory={message.trajectory}
                      beats={beats}
                    />
                  ) : null}
                </section>
              );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
          <div>
            <p className="text-sm text-neutral-300">{t("aiLab.trajectory.empty")}</p>
            <p className="mt-1 text-xs text-neutral-600">
              {t("aiLab.trajectory.emptyHint")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalLane({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[44px_1fr] items-center gap-2 py-0.5">
      <span className="font-mono text-[10px] text-neutral-600">{label}</span>
      <span className="relative h-1.5 overflow-hidden rounded-[2px] bg-white/[0.025]">
        {children}
      </span>
    </div>
  );
}
