import { ChannelType, ThreadAutoArchiveDuration, type Client, type TextChannel, type ThreadChannel } from 'discord.js';
import { insertManagedThread, listManagedThreads, updateManagedThread } from '../../../drizzle/managed-threads';
import { listParticipants } from '../../../drizzle/participants';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { admitGuest, joinThreads, type ManagedThreadRow } from './membership';
import { reactionsThreadName, revealThreadName } from './names';
import { roleMentions, trackedRoles } from './roles';

type GameRow = typeof Game.$inferSelect;

export type RevealThreads = { reveal: ManagedThreadRow; reactions: ManagedThreadRow };

/**
 * The grim reveal: a private thread where the Storytellers write the game
 * up, and a second where the players react once it is out. Both start with
 * the Storytellers alone. Publish pings the Players and Kibitzers into both,
 * which adds them, and locks the write-up so it reads as written. Later
 * readers are let in by `/reveal read` and `/reveal react`, as guests: they
 * need not be in the game. One reveal per game; rename rather than remake.
 */
export const revealThreads = async (gameId: string): Promise<RevealThreads | null> => {
  const [reveal] = await listManagedThreads(gameId, 'reveal');
  const [reactions] = await listManagedThreads(gameId, 'reactions');
  return reveal && reactions ? { reveal, reactions } : null;
};

const threadOf = async (client: Client, row: ManagedThreadRow): Promise<ThreadChannel | null> => {
  const channel = await client.channels.fetch(String(row.thread)).catch(() => null);
  return channel?.isThread() ? channel : null;
};

export type CreateResult = { ok: true; threads: RevealThreads } | { ok: false; reason: 'exists' | 'noChannel' };

export const createReveal = async (client: Client, game: GameRow, name: string): Promise<CreateResult> => {
  if (await revealThreads(game.id)) return { ok: false, reason: 'exists' };

  const channel = (await client.channels.fetch(String(game.channel)).catch(() => null)) as TextChannel | null;
  if (!channel || !('threads' in channel)) return { ok: false, reason: 'noChannel' };

  const make = (threadName: string) =>
    channel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Game: ${game.name} - reveal`,
    });
  const revealThread = await make(revealThreadName(name));
  const reactionsThread = await make(reactionsThreadName());

  const threads: RevealThreads = {
    reveal: await insertManagedThread({ game: game.id, kind: 'reveal', tag: name, thread: BigInt(revealThread.id) }),
    reactions: await insertManagedThread({
      game: game.id,
      kind: 'reactions',
      tag: name,
      thread: BigInt(reactionsThread.id),
    }),
  };
  for (const st of await listParticipants(game.id, 'Storyteller')) {
    await joinThreads(client, st, [threads.reveal, threads.reactions]);
  }
  return { ok: true, threads };
};

export const renameReveal = async (client: Client, game: GameRow, name: string): Promise<boolean> => {
  const threads = await revealThreads(game.id);
  if (!threads) return false;

  for (const [row, threadName] of [
    [threads.reveal, revealThreadName(name)],
    [threads.reactions, reactionsThreadName()],
  ] as const) {
    await updateManagedThread(row.id, { tag: name });
    const thread = await threadOf(client, row);
    await thread?.setName(threadName, 'Reveal renamed').catch((error: unknown) => {
      logger.warn({ message: `Could not rename thread ${row.thread} of game ${game.id}.`, error });
    });
  }
  return true;
};

/**
 * Out it goes: the Players and Kibitzers are pinged into both threads (a
 * role mention adds its members), then the write-up is locked so nobody
 * adds to it. The threads stay private, so only those let in can read.
 */
export const publishReveal = async (client: Client, game: GameRow): Promise<boolean> => {
  const threads = await revealThreads(game.id);
  if (!threads) return false;

  const who = roleMentions(['Player', 'Kibitzer'], await trackedRoles(game.id));
  const reveal = await threadOf(client, threads.reveal);
  const reactions = await threadOf(client, threads.reactions);

  await reveal
    ?.send({
      content: `${who.text.join(' ')} welcome to the reveal! You can react once you're done in <#${threads.reactions.thread}>.`,
      allowedMentions: { roles: who.ids },
    })
    .catch((error: unknown) => logger.warn({ message: `Could not announce the reveal of game ${game.id}.`, error }));

  await reactions
    ?.send({
      content: `${who.text.join(' ')} welcome to the reaction! Please spoiler all commentary outside of this thread.`,
      allowedMentions: { roles: who.ids },
    })
    .catch((error: unknown) => logger.warn({ message: `Could not open the reactions of game ${game.id}.`, error }));

  await reveal
    ?.setLocked(true, 'Reveal published')
    .catch((error: unknown) => logger.warn({ message: `Could not lock the reveal of game ${game.id}.`, error }));

  if (!threads.reveal.publishedAt) await updateManagedThread(threads.reveal.id, { publishedAt: new Date() });
  return true;
};

/**
 * Whether the reveal is out. A reveal published before the record kept that
 * reads it off Discord instead: publishing locked the write-up, so a locked
 * one is taken as published, and noted so the question is not asked again.
 */
const isPublished = async (client: Client, threads: RevealThreads): Promise<boolean> => {
  if (threads.reveal.publishedAt) return true;

  const reveal = await threadOf(client, threads.reveal);
  if (!reveal?.locked) return false;

  await updateManagedThread(threads.reveal.id, { publishedAt: new Date() });
  return true;
};

/** A latecomer into the write-up or the reactions, once the reveal is published. */
export const admitToReveal = async (
  client: Client,
  game: GameRow,
  which: 'reveal' | 'reactions',
  member: bigint,
): Promise<'admitted' | 'noReveal' | 'unpublished' | 'refused'> => {
  const threads = await revealThreads(game.id);
  if (!threads) return 'noReveal';
  if (!(await isPublished(client, threads))) return 'unpublished';
  return (await admitGuest(client, threads[which], member)) ? 'admitted' : 'refused';
};
