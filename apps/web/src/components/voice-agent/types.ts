export type VoiceStatus =
  'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';
export type OrbAppearance = 'liquid' | 'halo';
/** A ref lets the audio analyser drive the orb without React renders per frame. */
export type AudioLevel = number | { readonly current: number } | (() => number);
