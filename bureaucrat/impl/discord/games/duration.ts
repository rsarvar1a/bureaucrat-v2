/** Seconds per unit, largest first, so a duration formats as days before hours. */
const UNITS: [string, number][] = [
  ['d', 86_400],
  ['h', 3_600],
  ['m', 60],
  ['s', 1],
];

const PATTERN = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

/**
 * `1d13h4m2s` in seconds: each unit at most once, in that order, any of them
 * omitted, spaces ignored. Null for anything else, including nothing at all
 * and a duration of zero.
 */
export const parseDuration = (raw: string): number | null => {
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (!compact) return null;
  const match = PATTERN.exec(compact);
  if (!match) return null;

  const seconds = UNITS.reduce((total, [, size], index) => total + Number(match[index + 1] ?? 0) * size, 0);
  return seconds > 0 ? seconds : null;
};

/**
 * A list of durations (`4h 2h 1h`, or comma-separated), each a heads-up
 * before the reminder fires: distinct, longest first, and every one shorter
 * than the duration when it is given. An empty list is fine; a bad entry is
 * not, and the whole list is refused.
 */
export const parseOffsets = (raw: string, duration?: number | null): number[] | null => {
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seconds = parts.map(parseDuration);
  if (seconds.some((s) => s === null)) return null;

  const offsets = [...new Set(seconds as number[])].sort((a, b) => b - a);
  if (duration != null && offsets.some((o) => o >= duration)) return null;
  return offsets;
};

/** `1d 13h 4m 2s`, zero units left out; `0s` for nothing. */
export const formatDuration = (seconds: number): string => {
  let left = Math.max(0, Math.floor(seconds));
  const parts: string[] = [];
  for (const [unit, size] of UNITS) {
    const n = Math.floor(left / size);
    if (n > 0) parts.push(`${n}${unit}`);
    left -= n * size;
  }
  return parts.length > 0 ? parts.join(' ') : '0s';
};
