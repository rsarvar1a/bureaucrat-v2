import { ChannelType, ThreadAutoArchiveDuration, type Client, type TextChannel, type ThreadChannel } from 'discord.js';
import { updateGame } from '../../../drizzle/games';
import { getOrCreateGameSettings } from '../../../drizzle/game-settings';
import { insertManagedThread, listManagedThreads } from '../../../drizzle/managed-threads';
import { listParticipants } from '../../../drizzle/participants';
import { listSeating } from '../../../drizzle/seating';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { displayNames } from '../views/queue/members';
import { joinThreads } from './membership';
import { stThreadName } from './names';
import { roleMentions, trackedRoles } from './roles';

type GameRow = typeof Game.$inferSelect;

export type StartReport = { publicThreads: number; playerThreads: number; failed: string[] };

export type StartResult = { ok: true; report: StartReport } | { ok: false; reason: 'not-signups' | 'nothing-seated' };

/**
 * The planned threads not yet made, in reverse plan order: Discord lists
 * threads newest first, so making them last-to-first shows the plan's order
 * in the channel, which is the alphabetical one almost every Storyteller writes.
 */
export const threadsToCreate = (planned: string[], existingTags: string[]): string[] => {
  const have = new Set(existingTags);
  return [...new Set(planned)].filter((name) => !have.has(name)).reverse();
};

/**
 * Signups are over: the public threads the Storytellers planned open in the
 * game channel, every seated player gets a private thread with the
 * Storytellers, and the game is running. Sequential and forgiving - one
 * refused thread is reported, not fatal - and resumable: the tags say which
 * rows exist, Discord says which threads do, and a second Start finishes the job.
 */
export const startGame = async (client: Client, game: GameRow): Promise<StartResult> => {
  if (game.state !== 'signups') return { ok: false, reason: 'not-signups' };

  const seated = await listSeating(game.id);
  if (seated.length === 0) return { ok: false, reason: 'nothing-seated' };

  const channel = (await client.channels.fetch(String(game.channel)).catch(() => null)) as TextChannel | null;
  if (!channel || !('threads' in channel))
    return { ok: true, report: { publicThreads: 0, playerThreads: 0, failed: ['channel'] } };

  const report: StartReport = { publicThreads: 0, playerThreads: 0, failed: [] };
  const existing = await listManagedThreads(game.id);
  const settings = await getOrCreateGameSettings(game.id);

  // A Start cut short (a restart, a rate limit) may have made a thread and
  // died before its row: a thread of the right name and type that no row
  // names is adopted rather than made again.
  const known = new Set(existing.map((t) => String(t.thread)));
  const active = await channel.threads.fetchActive().catch(() => null);
  const orphan = (name: string, type: ChannelType): ThreadChannel | null => {
    const found = active?.threads.find((t) => t.name === name && t.type === type && !known.has(t.id)) ?? null;
    if (found) known.add(found.id);
    return found;
  };

  // A role mentioned in a thread brings its members in, so one ping seats the
  // whole town, Kibitzers included, in each public thread without a member call apiece.
  const welcome = roleMentions(['Player', 'Storyteller', 'Kibitzer'], await trackedRoles(game.id));

  for (const name of threadsToCreate(
    settings.plannedThreads,
    existing.map((t) => t.tag ?? ''),
  )) {
    try {
      const adopted = orphan(name, ChannelType.PublicThread);
      const thread =
        adopted ??
        (await channel.threads.create({
          name,
          type: ChannelType.PublicThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          reason: `Game: ${game.name}`,
        }));
      await insertManagedThread({ game: game.id, kind: 'public', tag: name, thread: BigInt(thread.id) });
      report.publicThreads += 1;
      if (adopted) continue;
      await thread
        .send({ content: `${welcome.text.join(' ')} welcome!`, allowedMentions: { roles: welcome.ids } })
        .catch((error: unknown) => logger.warn({ message: `Could not welcome the town to "${name}".`, error }));
    } catch (error) {
      logger.warn({ message: `Could not create public thread "${name}" for game ${game.id}.`, error });
      report.failed.push(name);
    }
  }

  const storytellers = await listParticipants(game.id, 'Storyteller');
  const participants = await listParticipants(game.id);
  const names = await displayNames(
    client,
    game.guild,
    seated.map((s) => s.member),
  );
  const haveThread = new Map(existing.filter((t) => t.kind === 'ST thread').map((t) => [t.tag, t]));

  for (const { seat, member } of seated) {
    // An empty seat's thread is tagged by the seat itself; it opens with the Storytellers alone.
    const tag = seat.player ?? seat.id;
    const player = participants.find((p) => p.id === seat.player);
    const called = seat.nickname ?? names[String(member)] ?? `seat-${seat.seat}`;

    try {
      let row = haveThread.get(tag);
      if (!row) {
        const thread =
          orphan(stThreadName(called), ChannelType.PrivateThread) ??
          (await channel.threads.create({
            name: stThreadName(called),
            type: ChannelType.PrivateThread,
            invitable: false,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Game: ${game.name}`,
          }));
        row = await insertManagedThread({ game: game.id, kind: 'ST thread', tag, thread: BigInt(thread.id) });
        report.playerThreads += 1;
      }
      // Joining is idempotent, so a thread whose Start died between the row
      // and its members is completed here rather than skipped.
      for (const st of storytellers) await joinThreads(client, st, [row]);
      if (player) await joinThreads(client, player, [row]);
    } catch (error) {
      logger.warn({ message: `Could not create the ST thread for seat ${seat.seat} of game ${game.id}.`, error });
      report.failed.push(called);
    }
  }

  await updateGame(game.id, { state: 'running' });

  return { ok: true, report };
};
