import type { SpawnTarget } from '../../../engine/discord/views/lifecycle';
import { countActiveGames } from '../../../drizzle/games';
import { listAcceptedSignups, listPendingSignups } from '../../../drizzle/queue-entry-signups';
import { adoptEntryScript } from '../../../drizzle/scripts';
import { insertSignups } from '../../../drizzle/signups';
import type { Queue, QueueEntry } from '../../../schema/core/queues.sql';
import { createGame } from './create';
import { freeSlots } from './vacancy';

type QueueRow = typeof Queue.$inferSelect;
type EntryRow = typeof QueueEntry.$inferSelect;

export type ClaimResult = Awaited<ReturnType<typeof createGame>>;

// The entry becomes the game: its storyteller and accepted signups carry over
// as participants, and the game points back at the queue so it counts against
// the queue's concurrency. The caller removes the entry afterwards.
export const claimEntry = async (target: SpawnTarget, queue: QueueRow, entry: EntryRow): Promise<ClaimResult> => {
  const signups = await listAcceptedSignups(entry.id);
  const of = (role: 'Storyteller' | 'Kibitzer' | 'Player') =>
    signups.filter((s) => s.role === role).map((s) => s.member);

  const created = await createGame(target, {
    guild: queue.guild,
    creator: entry.storyteller,
    name: entry.title,
    queue: queue.id,
    category: queue.category,
    storytellers: of('Storyteller'),
    kibitzers: of('Kibitzer'),
    players: of('Player'),
  });

  // The script the entry showed hopefuls is the game's from the start.
  await adoptEntryScript(entry.id, created.id);

  // Whoever was still waiting on the entry keeps waiting, now on the game.
  const pending = await listPendingSignups(entry.id);
  await insertSignups(
    pending.map((s) => ({ game: created.id, member: s.member, role: s.role, message: s.message ?? null })),
  );

  return created;
};

export const slotAvailable = async (queue: QueueRow): Promise<{ ok: true } | { ok: false; active: number }> => {
  const active = await countActiveGames(queue.id);
  return freeSlots(queue.concurrency, active) > 0 ? { ok: true } : { ok: false, active };
};
