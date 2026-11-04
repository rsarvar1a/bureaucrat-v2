import { ChannelType, ThreadAutoArchiveDuration, type Client, type TextChannel, type ThreadChannel } from 'discord.js';
import { listThreadsOfParticipant } from '../../../drizzle/managed-thread-participants';
import { insertManagedThread, listManagedThreads, updateManagedThread } from '../../../drizzle/managed-threads';
import { listParticipants } from '../../../drizzle/participants';
import { listSeating } from '../../../drizzle/seating';
import type { Game } from '../../../schema/core/games.sql';
import { logger } from '../../../utilities/logger';
import { displayNames } from '../views/queue/members';
import { joinThreads } from './membership';
import { stThreadName } from './names';

type GameRow = typeof Game.$inferSelect;
type ThreadRow = Awaited<ReturnType<typeof listManagedThreads>>[number];

export type StThreadReport = { created: number; failed: string[] };

export type StThreadOptions = {
  /**
   * Join the Storytellers and the player to every thread, not just new ones.
   * Start uses it so a run cut short between a row and its members is
   * finished; later calls leave threads that already work alone.
   */
  rejoin?: boolean;
  /** A thread of this name and type that no row names, adopted rather than made again. */
  orphan?: (name: string, type: ChannelType) => ThreadChannel | null;
};

/**
 * Which ST thread row is this seat's. Its tag is the player, or the seat
 * itself while the seat was empty; a substitute inherits the thread of the
 * player they replaced, so a thread the player is already in counts too.
 */
const rowOf = async (rows: ThreadRow[], seatId: string, player: string | null): Promise<ThreadRow | null> => {
  const byTag = (tag: string) => rows.find((row) => row.tag === tag) ?? null;
  if (!player) return byTag(seatId);
  const held = (await listThreadsOfParticipant(player)).find((t) => t.kind === 'ST thread');
  return byTag(player) ?? byTag(seatId) ?? (held ? (rows.find((row) => row.id === held.id) ?? null) : null);
};

/**
 * Every seat has its private thread with the Storytellers: one made for a
 * seat without, a seated player joined to theirs if they are not in it, and
 * the row retagged to the player when it was found another way, so
 * broadcasts and reminders reach everyone at the table. Sequential and
 * forgiving: a refused thread is reported, not fatal, and a second call
 * finishes the job.
 */
export const ensureStThreads = async (
  client: Client,
  game: GameRow,
  options: StThreadOptions = {},
): Promise<StThreadReport> => {
  const report: StThreadReport = { created: 0, failed: [] };
  const seated = await listSeating(game.id);
  if (seated.length === 0) return report;

  const channel = (await client.channels.fetch(String(game.channel)).catch(() => null)) as TextChannel | null;
  if (!channel || !('threads' in channel)) return { created: 0, failed: ['channel'] };

  const [rows, storytellers, participants, names] = await Promise.all([
    listManagedThreads(game.id, 'ST thread'),
    listParticipants(game.id, 'Storyteller'),
    listParticipants(game.id),
    displayNames(
      client,
      game.guild,
      seated.map((s) => s.member),
    ),
  ]);

  for (const { seat, member } of seated) {
    const player = participants.find((p) => p.id === seat.player) ?? null;
    const called = seat.nickname ?? names[String(member)] ?? `seat-${seat.seat}`;
    const tag = seat.player ?? seat.id;

    try {
      let row = await rowOf(rows, seat.id, seat.player);
      const fresh = !row;
      if (!row) {
        const name = stThreadName(called);
        const thread =
          options.orphan?.(name, ChannelType.PrivateThread) ??
          (await channel.threads.create({
            name,
            type: ChannelType.PrivateThread,
            invitable: false,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Game: ${game.name}`,
          }));
        row = await insertManagedThread({ game: game.id, kind: 'ST thread', tag, thread: BigInt(thread.id) });
        rows.push(row);
        report.created += 1;
      } else if (row.tag !== tag) {
        row = (await updateManagedThread(row.id, { tag })) ?? row;
      }

      if (fresh || options.rejoin) {
        for (const st of storytellers) await joinThreads(client, st, [row]);
      }
      if (player) {
        const inIt = (await listThreadsOfParticipant(player.id)).some((t) => t.id === row!.id);
        if (fresh || options.rejoin || !inIt) await joinThreads(client, player, [row]);
      }
    } catch (error) {
      logger.warn({ message: `Could not provide the ST thread for seat ${seat.seat} of game ${game.id}.`, error });
      report.failed.push(called);
    }
  }

  return report;
};

/** After the table changes mid-game: the same, only once the game is running and its threads exist. */
export const ensureStThreadsIfRunning = async (client: Client, game: GameRow | undefined): Promise<void> => {
  if (!game || game.state !== 'running') return;
  const report = await ensureStThreads(client, game);
  if (report.failed.length > 0) {
    logger.warn({ message: `ST threads for game ${game.id} not provided for: ${report.failed.join(', ')}.` });
  }
};
