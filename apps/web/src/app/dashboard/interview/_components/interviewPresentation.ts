import { fromAxiosError } from '@/lib/errors/normalize';
import type { VoiceStatus } from '@/components/voice-agent/types';
import type { OrbPhase } from './orbStates';
import type { VoiceLevels } from './audioLevels';

export type InterviewIssueKind =
  | 'missing'
  | 'access'
  | 'quota'
  | 'busy'
  | 'connection'
  | 'report'
  | 'start'
  | 'restore';
export interface InterviewIssue {
  kind: InterviewIssueKind;
  retryable: boolean;
  requestId?: string;
}

/** 面试页使用场景文案，不把报告接口的机器错误误报为用户填写错误。 */
export function interviewIssueOf(
  error: unknown,
  context: 'report' | 'start' | 'restore',
): InterviewIssue {
  const normalized = fromAxiosError(error);
  const code = normalized.errorCode;
  let kind: InterviewIssueKind = context;
  if (code === 'not_found' || code === 'session_invalid') kind = 'missing';
  else if (code === 'unauthenticated' || code === 'forbidden') kind = 'access';
  else if (code === 'quota_exceeded' || code === 'plan_required')
    kind = 'quota';
  else if (code === 'rate_limited') kind = 'busy';
  else if (code === 'upstream_unavailable')
    kind = context === 'report' ? 'report' : 'connection';
  return {
    kind,
    retryable: !['missing', 'access', 'quota'].includes(kind),
    ...(normalized.requestId ? { requestId: normalized.requestId } : {}),
  };
}

export function interviewVoiceStatus(phase: OrbPhase): VoiceStatus {
  return phase === 'finished' ? 'ended' : phase;
}

/** 静音只影响候选人；面试官的音轨继续驱动球体。 */
export function interviewAudioLevel(
  phase: OrbPhase,
  levels: VoiceLevels,
  muted: boolean,
): number {
  const value =
    phase === 'speaking'
      ? levels.output
      : phase === 'listening' && !muted
        ? levels.input * 0.65
        : 0;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
