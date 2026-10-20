'use client';

import { useEffect, useMemo, useState } from 'react';
import voiceSamples from './voicePreviewSamples.json';
import {
  VoicePreviewPlayer,
  type VoicePreviewSample,
  type VoicePreviewState,
} from './voicePreviewPlayer';

const samples = new Map<string, VoicePreviewSample>(
  Object.entries(voiceSamples),
);

export function useInterviewVoicePreview(enabled: boolean) {
  const [state, setState] = useState<VoicePreviewState>({
    voice: null,
    phase: 'idle',
  });
  const player = useMemo(() => new VoicePreviewPlayer(setState), []);
  useEffect(() => {
    if (!enabled) player.stop();
    const stopWhenHidden = () => {
      if (document.hidden) player.stop();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', player.stop);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', player.stop);
      player.dispose();
    };
  }, [enabled, player]);

  return {
    state,
    hasSample: (voice: string) => samples.has(voice),
    toggle: (voice: string) => {
      const sample = samples.get(voice);
      if (!enabled || !sample) return;
      void player.toggle(voice, sample);
    },
    stop: player.stop,
    readLevels: player.readLevels,
  };
}

export type InterviewVoicePreview = ReturnType<typeof useInterviewVoicePreview>;
