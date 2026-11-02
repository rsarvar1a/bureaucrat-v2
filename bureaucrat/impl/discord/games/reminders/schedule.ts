import { formatDuration } from '../duration';

/** The timing a reminder carries: when it fires, its heads-ups, and what has gone out. */
export type Schedule = { fireAt: Date; offsets: number[]; posted: number[] };

/** The final post is the offset of zero, so one list covers the heads-ups and the reminder itself. */
export const FINAL = 0;

/**
 * Every post whose moment has come and not been made, longest heads-up
 * first. More than one is due after downtime; the caller posts the latest
 * (the last) and records them all, so a missed heads-up is not posted stale.
 */
export const dueOffsets = (schedule: Schedule, now: Date): number[] =>
  [...new Set([...schedule.offsets, FINAL])]
    .filter((offset) => !schedule.posted.includes(offset))
    .filter((offset) => schedule.fireAt.getTime() - offset * 1000 <= now.getTime())
    .sort((a, b) => b - a);

export const isDone = (schedule: Pick<Schedule, 'posted'>): boolean => schedule.posted.includes(FINAL);

/** The heads-ups still to come, longest first. */
export const remainingHeadsUps = (schedule: Schedule): number[] =>
  schedule.offsets.filter((o) => o > FINAL && !schedule.posted.includes(o)).sort((a, b) => b - a);

/**
 * The post's first line: who it is for and when it is due, as Discord's
 * relative time, so a heads-up reads "in 4 hours" and the final post "now".
 */
export const reminderHeader = (fireAt: Date, mentions: string[]): string => {
  const who = mentions.length > 0 ? ` for ${mentions.join(', ')}` : '';
  return `Reminder${who} <t:${Math.floor(fireAt.getTime() / 1000)}:R>`;
};

/** The message beneath, quoted line by line. */
export const quoted = (message: string): string =>
  message
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** The heads-ups as a Storyteller reads them back: `4h, 2h, 1h before`, or none. */
export const headsUpText = (offsets: number[]): string =>
  offsets.length > 0
    ? `${[...offsets]
        .sort((a, b) => b - a)
        .map(formatDuration)
        .join(', ')} before`
    : 'none';
