"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "@magic-resume/icons";
import { cn } from "@/lib/utils";
import type {
  AgentTrajectory,
  MessageBeat,
  ToolCall,
} from "../types";
import { toToolChipRows } from "./toolTrace";

function durationLabel(ms: number): string {
  if (ms < 1_000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function beatStepId(beat: MessageBeat): string | undefined {
  return beat.kind === "tool" ? beat.call.stepId : beat.kind === "text" ? beat.stepId : undefined;
}

function toolOutput(call: ToolCall, detail: string | undefined): string {
  if (call.error) return call.error;
  if (detail) return detail;
  return call.done ? "✓" : "…";
}

/**
 * DeepSeek Harness 风格的紧凑轨迹投影。
 *
 * 数据仍由 message.timeline + trajectory 驱动；这个组件只负责投影，不在渲染层重新猜
 * Step 或配对 tool result。这样历史回放与实时运行看到的是同一份记录。
 */
export default function TrajectoryView({
  trajectory,
  beats,
}: {
  trajectory: AgentTrajectory;
  beats: MessageBeat[];
}) {
  const { t } = useTranslation();
  const now = Date.now();
  const endAt = trajectory.completedAt ?? now;
  const totalMs = Math.max(1, endAt - trajectory.startedAt);
  const calls = beats.filter((beat) => beat.kind === "tool").length;

  if (!beats.length) return null;

  const segmentStyle = (start: number, end?: number) => {
    const left = Math.max(0, ((start - trajectory.startedAt) / totalMs) * 100);
    const width = Math.max(
      1.2,
      (((end ?? now) - start) / totalMs) * 100,
    );
    return {
      left: `${Math.min(100, left)}%`,
      width: `${Math.min(100 - left, width)}%`,
    };
  };

  const firstModelAt = trajectory.steps[0]?.startedAt;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2 font-mono text-[10px] tabular-nums text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <Clock size={10} />
          {durationLabel(totalMs)}
        </span>
        <span>{t("aiLab.trajectory.steps", { count: trajectory.steps.length })}</span>
        <span>{t("aiLab.trajectory.calls", { count: calls })}</span>
      </div>

      <div className="border-b border-white/[0.06] px-3 py-2">
        <TimelineLane label={t("aiLab.trajectory.lanes.input")}>
          {firstModelAt ? (
            <span
              className="absolute inset-y-0 rounded-[2px] bg-sky-400/75"
              style={segmentStyle(trajectory.startedAt, firstModelAt)}
            />
          ) : null}
        </TimelineLane>
        <TimelineLane label={t("aiLab.trajectory.lanes.model")}>
          {trajectory.steps.map((step) => (
            <span
              key={step.id}
              className="absolute inset-y-0 rounded-[2px] bg-violet-400/75"
              style={segmentStyle(step.startedAt, step.completedAt)}
            />
          ))}
        </TimelineLane>
        <TimelineLane label={t("aiLab.trajectory.lanes.tools")}>
          {beats.map((beat) =>
            beat.kind === "tool" && beat.call.startedAt ? (
              <span
                key={beat.id}
                className={cn(
                  "absolute inset-y-0 rounded-[2px]",
                  beat.call.error ? "bg-red-400/80" : "bg-amber-400/80",
                )}
                style={segmentStyle(
                  beat.call.startedAt,
                  beat.call.completedAt,
                )}
              />
            ) : null,
          )}
        </TimelineLane>
      </div>

      <TrajectoryRows trajectory={trajectory} beats={beats} />
    </div>
  );
}

/** 仅渲染记录行，供整场会话的独立轨迹页复用。 */
export function TrajectoryRows({
  trajectory,
  beats,
}: {
  trajectory: AgentTrajectory;
  beats: MessageBeat[];
}) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-white/[0.045]">
      {beats.map((beat, index) => {
        if (beat.kind === "widget") return null;
        const stepId = beatStepId(beat);
        const previousStepId = index > 0 ? beatStepId(beats[index - 1]) : undefined;
        const startsStep = Boolean(stepId && stepId !== previousStepId);
        const step = trajectory.steps.find((item) => item.id === stepId);

        if (beat.kind === "text") {
          const text = beat.text.trim().replace(/\s+/g, " ");
          if (!text) return null;
          return (
            <TrajectoryRow
              key={beat.id}
              startsStep={startsStep}
              stepIndex={step?.index}
              badge={t("aiLab.trajectory.actor.assistant")}
              badgeClass="bg-violet-400/10 text-violet-300"
              duration={
                beat.startedAt && beat.completedAt
                  ? durationLabel(beat.completedAt - beat.startedAt)
                  : undefined
              }
            >
              <span className="block min-w-0 truncate text-neutral-400">{text}</span>
            </TrajectoryRow>
          );
        }

        const [row] = toToolChipRows([beat.call], t);
        const output = toolOutput(beat.call, row?.detail?.[0]?.text);
        return (
          <TrajectoryRow
            key={beat.id}
            startsStep={startsStep}
            stepIndex={step?.index}
            badge={t("aiLab.trajectory.actor.tool")}
            badgeClass={
              beat.call.error
                ? "bg-red-400/10 text-red-300"
                : "bg-amber-400/10 text-amber-300"
            }
            duration={
              beat.call.startedAt && beat.call.completedAt
                ? durationLabel(beat.call.completedAt - beat.call.startedAt)
                : undefined
            }
          >
            <span className="shrink-0 text-neutral-300">{row?.label}</span>
            {row?.chip ? (
              <span className="min-w-0 truncate font-mono text-neutral-500">
                {row.chip}
              </span>
            ) : null}
            <span className="shrink-0 text-neutral-700">→</span>
            <span
              className={cn(
                "min-w-0 truncate",
                beat.call.error ? "text-red-300/80" : "text-neutral-500",
              )}
            >
              {output}
            </span>
          </TrajectoryRow>
        );
      })}
    </div>
  );
}

function TimelineLane({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[38px_1fr] items-center gap-2 py-0.5">
      <span className="font-mono text-[9px] text-neutral-600">{label}</span>
      <span className="relative h-1.5 overflow-hidden rounded-[2px] bg-white/[0.025]">
        {children}
      </span>
    </div>
  );
}

function TrajectoryRow({
  startsStep,
  stepIndex,
  badge,
  badgeClass,
  duration,
  children,
}: {
  startsStep: boolean;
  stepIndex?: number;
  badge: string;
  badgeClass: string;
  duration?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-w-0 grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 font-mono text-[10px] leading-4">
      {startsStep ? (
        <span
          className="absolute -left-px top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-500 ring-2 ring-[#171717]"
          title={stepIndex ? `Step ${stepIndex}` : undefined}
        />
      ) : null}
      <span className={cn("w-fit rounded px-1.5 py-0.5 text-[9px]", badgeClass)}>
        {badge}
      </span>
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      <span className="text-[9px] tabular-nums text-neutral-700">{duration}</span>
    </div>
  );
}
