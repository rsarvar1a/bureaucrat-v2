import { time, TimestampStyles } from 'discord.js';

/** The small print under a square: when the players last saw it change. */
export const publishedLine = (publishedAt: Date | null): string =>
  publishedAt ? `-# Published ${time(publishedAt, TimestampStyles.RelativeTime)}.` : '-# Not yet published.';
