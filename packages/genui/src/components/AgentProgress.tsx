'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface AgentProgressStep {
  /** Stable key for a step. Labels remain the accessible name. */
  key?: string;
  label: string;
  /** Host-owned lifecycle state. Omitting it renders the step as pending. */
  status?: 'pending' | 'in_progress' | 'completed';
  /** Optional visual fraction for an in-progress step (0–1). */
  progress?: number;
}

export interface AgentProgressProps {
  /** Ordered work items shown in the progress block. */
  steps: Array<string | AgentProgressStep>;
  className?: string;
}
/**
 * Keep the first completed transition on screen long enough to be perceived.
 *
 * The analyze tool emits an in-progress snapshot immediately before reading
 * the resume, then emits the completed snapshot as soon as that read returns.
 * When the read is fast React can commit only the latter frame, making the
 * first row appear crossed out from the moment the card mounts. This is only a
 * short visual hand-off; the host status remains the source of truth.
 */
const CONTROLLED_TRANSITION_DWELL_MS = 520;

type NormalizedStep = {
  key: string;
  label: string;
  status?: AgentProgressStep['status'];
  progress?: number;
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="agent-progress-check-icon"
    >
      <circle cx="7" cy="7" r="7" fill="var(--agent-progress-icon-fill)" />
      <path
        d="M4 7.5 5.646 9.146a.5.5 0 0 0 .708 0L10 5.5"
        fill="none"
        stroke="var(--agent-progress-icon-stroke)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 15 15"
      className="agent-progress-pending-icon"
    >
      <circle
        cx="7.5"
        cy="7.5"
        r="7"
        fill="none"
        stroke="var(--agent-progress-pending-stroke)"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

function ProgressIcon({ progress }: { progress: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="agent-progress-step-ring"
    >
      <circle
        cx="7"
        cy="7"
        r="5.75"
        fill="none"
        stroke="var(--agent-progress-track)"
        strokeWidth="1.5"
      />
      <circle
        data-step-progress="true"
        cx="7"
        cy="7"
        r="5.75"
        fill="none"
        stroke="var(--agent-progress-ring)"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray={`${progress} 1`}
      />
    </svg>
  );
}

function OverallRing({ progress }: { progress: number }) {
  return (
    <span className="agent-progress-overall-ring" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16">
        <circle
          cx="8"
          cy="8"
          r="6.75"
          fill="none"
          stroke="var(--agent-progress-track)"
          strokeWidth="2.5"
        />
        <circle
          data-progress-ring="true"
          cx="8"
          cy="8"
          r="6.75"
          fill="none"
          stroke="var(--agent-progress-ring)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray={`${progress} 1`}
        />
      </svg>
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="agent-progress-arrow-icon"
    >
      <path
        d="M7.47 2.47a.75.75 0 0 1 1.06 0l4.177 4.176a.5.5 0 0 1 0 .708L8.53 11.53a.75.75 0 0 1-1.06-1.06l2.72-2.72H2a.75.75 0 0 1 0-1.5h8.19L7.47 3.53a.75.75 0 0 1 0-1.06Z"
        fill="var(--agent-progress-icon-stroke)"
      />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <span aria-hidden="true" className="agent-progress-minimize-icon">
      <span />
      <i />
    </span>
  );
}

/**
 * A compact, controlled progress block for multi-step agent work.
 *
 * The host owns the lifecycle. Every visual transition is derived from the
 * `status`/`progress` values in `steps`; this component never invents work or
 * advances a timer when an event is missing.
 */
export default function AgentProgress({
  steps,
  className = '',
}: AgentProgressProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const normalizedSteps = useMemo<NormalizedStep[]>(
    () =>
      steps.map((step, index) =>
        typeof step === 'string'
          ? { key: String(index), label: step, status: 'pending' as const }
          : {
              key: step.key ?? String(index),
              label: step.label,
              status: step.status ?? 'pending',
              progress: step.progress,
            },
      ),
    [steps],
  );
  const controlled = true;
  const controlledActiveIndex = normalizedSteps.findIndex(
    (step) => step.status !== 'completed',
  );
  const controlledCompletedCount = normalizedSteps.filter(
    (step) => step.status === 'completed',
  ).length;
  const controlledFinished =
    normalizedSteps.length === 0 ||
    controlledCompletedCount === normalizedSteps.length;
  const controlledHasCompletedBeforeActive =
    controlledActiveIndex > 0 &&
    normalizedSteps[controlledActiveIndex - 1]?.status === 'completed';
  const controlledSignature = normalizedSteps
    .map((step) => `${step.key}:${step.status ?? 'unset'}:${step.progress ?? ''}`)
    .join('|');
  const [minimized, setMinimized] = useState(false);
  const [entered, setEntered] = useState(reducedMotion);
  const [heldControlledSignature, setHeldControlledSignature] = useState<
    string | null
  >(null);
  const minimizedButton = useRef<HTMLButtonElement>(null);
  const expandedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMinimized(false);
  }, [normalizedSteps.length]);

  useEffect(() => {
    if (
      !controlled ||
      controlledFinished ||
      controlledActiveIndex <= 0 ||
      !controlledHasCompletedBeforeActive
    ) {
      setHeldControlledSignature(null);
      return;
    }

    setHeldControlledSignature(controlledSignature);
    const timer = window.setTimeout(() => {
      setHeldControlledSignature((current) =>
        current === controlledSignature ? null : current,
      );
    }, CONTROLLED_TRANSITION_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [
    controlled,
    controlledActiveIndex,
    controlledHasCompletedBeforeActive,
    controlledFinished,
    controlledSignature,
  ]);

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const holdingControlledTransition =
    controlled &&
    heldControlledSignature === controlledSignature &&
    !controlledFinished &&
    controlledActiveIndex > 0;
  const displayedSteps = holdingControlledTransition
    ? normalizedSteps.map((step, index) =>
        index === controlledActiveIndex - 1
          ? { ...step, status: 'in_progress' as const, progress: 0.18 }
          : step,
      )
    : normalizedSteps;
  const displayedActiveIndex = displayedSteps.findIndex(
    (step) => step.status !== 'completed',
  );
  const displayedCompletedCount = displayedSteps.filter(
    (step) => step.status === 'completed',
  ).length;
  const displayedFinished =
    displayedSteps.length > 0 &&
    displayedCompletedCount === displayedSteps.length;
  const displayedStepProgress =
    displayedActiveIndex >= 0 &&
    displayedSteps[displayedActiveIndex]?.status === 'in_progress'
      ? Math.min(
          1,
          Math.max(0, displayedSteps[displayedActiveIndex]?.progress ?? 0.5),
        )
      : 0;
  const visibleActiveIndex = Math.max(0, displayedActiveIndex);
  const visibleStepProgress = displayedStepProgress;
  const visibleFinished = displayedFinished;
  const visibleCompletedCount = displayedCompletedCount;
  const overallProgress =
    normalizedSteps.length === 0
      ? 1
      : Math.min(
          1,
          (visibleCompletedCount + visibleStepProgress) /
            normalizedSteps.length,
        );
  const remaining = Math.max(0, normalizedSteps.length - visibleCompletedCount);
  const headerLabel = visibleFinished
    ? '全部步骤已完成'
    : `剩余 ${remaining} 项`;
  const currentLabel =
    normalizedSteps[
      Math.min(visibleActiveIndex, Math.max(0, normalizedSteps.length - 1))
    ]?.label ?? '';

  return (
    <div
      className={`agent-progress-stage-card ${minimized ? 'is-minimized' : ''} ${entered ? 'is-entered' : ''} ${className}`.trim()}
      data-testid="agent-progress"
      aria-live="polite"
      style={{
        height: entered ? (minimized ? 44 : 235) : 36,
      }}
    >
      {!visibleFinished && <OverallRing progress={overallProgress} />}

      <div className="agent-progress-expanded" aria-hidden={minimized}>
        <div className="agent-progress-expanded-inner">
          <div className="agent-progress-header">
            <span
              className={`agent-progress-header-spacer ${visibleFinished ? '' : 'has-ring'}`}
              aria-hidden="true"
            />
            <span
              key={headerLabel}
              className="agent-progress-header-label agent-progress-label-pop"
            >
              {headerLabel}
            </span>
            <button
              type="button"
              ref={expandedButton}
              className="agent-progress-minimize-button"
              aria-label="Minimize steps"
              tabIndex={minimized ? -1 : 0}
              onClick={() => {
                setMinimized(true);
                requestAnimationFrame(() => minimizedButton.current?.focus());
              }}
            >
              <MinimizeIcon />
            </button>
          </div>

          <div className="agent-progress-rows">
            {displayedSteps.map((step, index) => {
              const done = step.status === 'completed';
              const active = !visibleFinished && index === visibleActiveIndex;
              return (
                <div
                  className={`agent-progress-row ${active ? 'is-active' : ''}`}
                  key={step.key}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <span className="agent-progress-row-icon">
                    {done ? (
                      <CheckIcon />
                    ) : active ? (
                      <ProgressIcon progress={visibleStepProgress} />
                    ) : (
                      <PendingIcon />
                    )}
                  </span>
                  <span
                    className={`agent-progress-label ${done ? 'is-done' : active ? 'is-current' : ''}`}
                  >
                    <span aria-label={step.label}>{step.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        ref={minimizedButton}
        type="button"
        className="agent-progress-minimized-button"
        data-testid="agent-progress-minimized"
        aria-label="Expand steps"
        aria-hidden={!minimized}
        tabIndex={minimized ? 0 : -1}
        onClick={() => {
          setMinimized(false);
          requestAnimationFrame(() => expandedButton.current?.focus());
        }}
      >
        {!visibleFinished && (
          <span
            className="agent-progress-minimized-spacer"
            aria-hidden="true"
          />
        )}
        <span className="agent-progress-minimized-count">{headerLabel}</span>
        <span className="agent-progress-minimized-current">
          <ArrowIcon />
          <span>{currentLabel}</span>
        </span>
        <MinimizeIcon />
      </button>
    </div>
  );
}
