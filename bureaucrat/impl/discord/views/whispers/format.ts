import { time, TimestampStyles } from 'discord.js';
import type { Standing } from '../../games/whispers/propose';

/** `x / y`, with `(z / a async)` when the game has async whispers at all. */
export const standingText = (s: Standing | undefined): string | null => {
  if (!s) return null;
  const main = `${s.spent.total} / ${s.allowance.total}`;
  return s.allowance.async > 0 ? `${main} (${s.spent.async} / ${s.allowance.async} async)` : main;
};

/**
 * One member on the whisper card: their name, then a bullet with where they
 * stood when it opened and, once they have left, that they did. With precise
 * tracking the bullet carries when, and stays once the whisper has closed;
 * without, a closed whisper says nothing of who left first.
 */
export const memberLines = (
  name: string,
  standing: Standing | undefined,
  endedAt: Date | null,
  options: { closed: boolean; precise: boolean },
): string => {
  const bits: string[] = [];
  const stood = standingText(standing);
  if (stood) bits.push(stood);
  if (endedAt && options.precise) bits.push(`ended ${time(endedAt, TimestampStyles.RelativeTime)}`);
  else if (endedAt && !options.closed) bits.push('ended');
  return bits.length > 0 ? `${name}\n- ${bits.join(' · ')}` : name;
};
