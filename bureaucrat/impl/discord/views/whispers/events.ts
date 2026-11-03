/**
 * One label, two routes: the invitation card and the promotion card both
 * carry the whisper id as their entity, so one concrete label repaints both.
 */
export const WhisperEvents = {
  Changed: 'whisper::${gwhisper}::changed',
  PromoteChanged: 'whisper::${gwhisperpromote}::changed',
} as const;

export const whisperChanged = (whisper: string): string => `whisper::${whisper}::changed`;
