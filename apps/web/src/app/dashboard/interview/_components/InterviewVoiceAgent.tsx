'use client';

import React, { useCallback } from 'react';
import { VoiceAgent } from '@/components/voice-agent';
import type { OrbPhase } from './orbStates';
import type { VoiceLevels } from './audioLevels';
import {
  interviewAudioLevel,
  interviewVoiceStatus,
} from './interviewPresentation';

export default function InterviewVoiceAgent({
  phase,
  muted,
  readLevels,
}: {
  phase: OrbPhase;
  muted: boolean;
  readLevels: () => VoiceLevels;
}) {
  const readAudio = useCallback(
    () => interviewAudioLevel(phase, readLevels(), muted),
    [phase, readLevels, muted],
  );
  return (
    <VoiceAgent
      surface="embedded"
      appearance="halo"
      status={interviewVoiceStatus(phase)}
      muted={muted}
      audioLevel={readAudio}
      transcript={false}
    />
  );
}
