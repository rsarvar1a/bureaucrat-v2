import type { Client, TextBasedChannel } from 'discord.js';
import { listViews } from '../../../engine/discord/views/query';
import { writable } from '../../../engine/discord/views/threads';
import { closeWindow } from '../../../engine/discord/views/windows';
import type { GameRatingRow } from '../../../drizzle/game-ratings';
import { getParticipantByMember } from '../../../drizzle/participants';
import type { Game } from '../../../schema/core/games.sql';
import { spawnByRoute } from './create';
import { revealThreads } from './reveal';

type GameRow = typeof Game.$inferSelect;

export const RATING_CARD = 'grating';
export const RATING_FORM = 'gratingform';
export const RATINGS_PANE = 'gratings';

/** The four questions, in the order they are asked. */
export const ASPECTS = ['script', 'decisions', 'atmosphere', 'overall'] as const;
export type Aspect = (typeof ASPECTS)[number];

/** Where each question's note lives: the last one's is the general comments box. */
export const NOTE_OF = {
  script: 'scriptNote',
  decisions: 'decisionsNote',
  atmosphere: 'atmosphereNote',
  overall: 'comment',
} as const satisfies Record<Aspect, keyof GameRatingRow>;

export type Question = {
  key: Aspect;
  /** The button and the heading. */
  title: string;
  /** The mark field's label: the question itself. Under 45 characters, as a modal label must be. */
  question: string;
  /** Under the mark field. */
  hint: string;
  /** The note field's label. */
  more: string;
};

export const QUESTIONS: Question[] = [
  {
    key: 'script',
    title: 'Script',
    question: 'How much did you enjoy this script?',
    hint: '1 (not at all) to 5 (loved it)',
    more: 'Say more about the script',
  },
  {
    key: 'decisions',
    title: 'Decisions',
    question: 'How were the storytelling decisions?',
    hint: 'Did the game feel fair? 1 (no) to 5 (yes)',
    more: 'Say more about the decisions',
  },
  {
    key: 'atmosphere',
    title: 'Atmosphere',
    question: 'Was the game atmosphere healthy?',
    hint: 'Did the Storyteller promote one? 1 (no) to 5 (yes)',
    more: 'Say more about the atmosphere',
  },
  {
    key: 'overall',
    title: 'Overall',
    question: 'Overall, what would you rate this game?',
    hint: '1 (bad) to 5 (excellent)',
    more: 'Any other comments or concerns?',
  },
];

export const isMark = (value: number): value is 1 | 2 | 3 | 4 | 5 =>
  Number.isInteger(value) && value >= 1 && value <= 5;

/** What a short field says, as a mark: `4`, ` 4 `, `4/5` all count; anything else is nothing. */
export const parseMark = (text: string): number | null => {
  const match = /^\s*([1-5])\s*(?:\/\s*5\s*)?$/.exec(text);
  return match ? Number(match[1]) : null;
};

/** The answers as the form holds them: every mark and note the member has given so far. */
export type Draft = Partial<Record<Aspect, number>> & Partial<Record<(typeof NOTE_OF)[Aspect], string | null>>;

export const draftOf = (row: GameRatingRow | undefined): Draft =>
  row
    ? {
        script: row.script,
        scriptNote: row.scriptNote,
        decisions: row.decisions,
        decisionsNote: row.decisionsNote,
        atmosphere: row.atmosphere,
        atmosphereNote: row.atmosphereNote,
        overall: row.overall,
        comment: row.comment,
      }
    : {};

export const isComplete = (draft: Draft): draft is Draft & Record<Aspect, number> =>
  ASPECTS.every((aspect) => typeof draft[aspect] === 'number');

export type PlaceRating = 'opened' | 'noReveal' | 'noThread';

/**
 * Puts the rating card in the reveal thread, and nowhere else: an earlier
 * copy comes down first, so running the command again moves it to the
 * bottom rather than doubling it. The thread is where the players land
 * once the reveal is out, which is when the game is theirs to judge.
 */
export const placeRatingCard = async (client: Client, game: GameRow): Promise<PlaceRating> => {
  const threads = await revealThreads(game.id);
  if (!threads) return 'noReveal';
  const channel = await client.channels.fetch(String(threads.reveal.thread)).catch(() => null);
  if (!channel || !('send' in channel)) return 'noThread';

  for (const row of await listViews({ route: RATING_CARD, entityId: game.id, visibility: 'public' })) {
    await closeWindow(client, row);
  }
  await writable(channel);
  await spawnByRoute(
    RATING_CARD,
    { client, channel: channel as TextBasedChannel },
    { entityId: game.id, ids: { gconfig: game.id }, visibility: 'public' },
  );
  return 'opened';
};

export type Rater = { ok: true; role: 'Player' | 'Kibitzer' } | { ok: false; reason: 'notInGame' | 'storyteller' };

/** Who may rate: the game's Players and Kibitzers. The Storytellers are who it is for. */
export const raterOf = async (gameId: string, member: bigint): Promise<Rater> => {
  const participant = await getParticipantByMember(gameId, member);
  if (!participant) return { ok: false, reason: 'notInGame' };
  if (participant.role === 'Storyteller') return { ok: false, reason: 'storyteller' };
  return { ok: true, role: participant.role };
};

export type Summary = { count: number; average: Record<Aspect, number> };

/** The mean of each mark over the ratings given; zero across the board when there are none. */
export const summarize = (ratings: Record<Aspect, number>[]): Summary => {
  const average = Object.fromEntries(
    ASPECTS.map((aspect) => [
      aspect,
      ratings.length === 0 ? 0 : ratings.reduce((sum, r) => sum + r[aspect], 0) / ratings.length,
    ]),
  ) as Record<Aspect, number>;
  return { count: ratings.length, average };
};

export const stars = (mark: number): string => '★'.repeat(Math.round(mark)) + '☆'.repeat(5 - Math.round(mark));
