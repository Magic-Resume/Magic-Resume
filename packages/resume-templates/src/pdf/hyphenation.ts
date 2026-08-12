const cjkCharacterRegex = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const MIN_BREAKABLE_WORD_LENGTH = 16;

export const magicPdfHyphenationCallback = (word: string): string[] => {
  if (word === ' ') return [word];
  if (!cjkCharacterRegex.test(word) && Array.from(word).length < MIN_BREAKABLE_WORD_LENGTH) {
    return [word];
  }

  // Empty fragments expose character-level break opportunities without
  // asking textkit to paint a hyphen at the end of the wrapped line.
  return Array.from(word).flatMap((character) => [character, '']);
};
