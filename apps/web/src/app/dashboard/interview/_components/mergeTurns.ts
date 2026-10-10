import type { VoiceTurn } from './useVoiceInterview';

const chronological = (turns: VoiceTurn[]): VoiceTurn[] =>
  [...turns].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

/** A final update owns its original segment, even after another speaker intervenes. */
export function upsertVoiceTurn(
  turns: VoiceTurn[],
  turn: VoiceTurn,
): VoiceTurn[] {
  const index =
    turn.segmentId === undefined
      ? -1
      : turns.findIndex(
          (item) =>
            item.segmentId === turn.segmentId && item.role === turn.role,
        );
  if (index < 0) return chronological([...turns, turn]);
  return chronological(
    turns.map((item, i) =>
      i === index
        ? {
            ...turn,
            ...(item.at === undefined && turn.at === undefined
              ? {}
              : { at: item.at ?? turn.at }),
          }
        : item,
    ),
  );
}

/** Merge HTTP history and voice events by speech time, preserving genuine repeats. */
export function mergeInterviewTurns(
  seeded: VoiceTurn[],
  live: VoiceTurn[],
): VoiceTurn[] {
  const tail = seeded[seeded.length - 1];
  const head = live[0];
  // The HTTP opening can also be spoken by LiveKit. Only this seam is a duplicate.
  const sameOpening =
    tail &&
    head &&
    tail.role === 'interviewer' &&
    !tail.segmentId &&
    tail.role === head.role &&
    tail.text.trim() === head.text.trim();
  let result = sameOpening ? seeded.slice(0, -1) : [...seeded];
  for (const turn of live) {
    const resolved =
      sameOpening && turn === head
        ? { ...turn, ...(tail.at === undefined ? {} : { at: tail.at }) }
        : turn;
    result = upsertVoiceTurn(result, resolved);
  }
  return chronological(result);
}
