/** Discord's limit on a channel name. */
const NAME_LIMIT = 100;

/**
 * A channel name from a game's title: lowercase, words joined by dashes,
 * nothing Discord would strip. An empty result falls back to `game` rather
 * than to an error, since a title of only punctuation is odd but not wrong.
 */
export const channelName = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_LIMIT)
    .replace(/-+$/, '');

  return slug || 'game';
};

/** `20261101` for the first of November: the date an ended game's channel is filed under. */
export const dateStamp = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;

/**
 * An ended game's channel name: the date it ended in front of the title, so
 * the archive reads chronologically. The title gives way to the stamp at the
 * limit, never the other way round.
 */
export const endedChannelName = (title: string, endedAt: Date): string => {
  const stamp = dateStamp(endedAt);
  return `${stamp}-${channelName(title)}`.slice(0, NAME_LIMIT).replace(/-+$/, '');
};

const STAMPED = /^(\d{4})(\d{2})(\d{2})(?:-|$)/;

/** The date a channel name files itself under, when it starts with one: the inverse of `endedChannelName`. */
export const parseDateStamp = (name: string): Date | null => {
  const match = STAMPED.exec(name);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** A title read back off a channel name: the stamp dropped, the dashes spaces. `game` for a name that was only a stamp. */
export const titleFromChannelName = (name: string): string => {
  const title = name.replace(STAMPED, '').replace(/-+/g, ' ').trim();
  return title || 'game';
};

/** The three private threads every game opens with, by their `ManagedThread` kind. Capitals mark them as the game's own. */
export const THREAD_NAMES = {
  storyteller: 'ST PRIVATE',
  config: 'GAME CONFIG',
  kibitz: 'KIBITZ',
} as const;

export type CoreThreadKind = keyof typeof THREAD_NAMES;

/** The Storytellers' write-up of the game, and the players' thread for reacting to it. */
export const revealThreadName = (name: string): string => `Reveal: ${name.trim()}`.slice(0, NAME_LIMIT).trimEnd();
export const reactionsThreadName = (): string => 'Reveal Reactions';

/** A player's private Storyteller thread, from whatever the Storytellers call them, as written. */
export const stThreadName = (player: string): string =>
  `ST Thread - ${player.trim() || 'player'}`.slice(0, NAME_LIMIT).trimEnd();
