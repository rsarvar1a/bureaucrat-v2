import type { ViewGuard } from '../../../engine/discord/views/types';
import { getQueue } from '../../../drizzle/queues';
import { getQueueEntry, listQueueEntries } from '../../../drizzle/queue-entries';
import { nextClaimant } from '../games/vacancy';
import { Permissions } from '../../acl/permissions';
import { accessAllows, actorOf, mayJoinAs } from '../access';
import { inSameGuild } from './scope';
import type { Locator } from './index';
import { S } from '../../../strings';

/** The queue a panel is bound to: the queue view and every ephemeral spawned beneath it. */
export const queueFromEntity: Locator = async (ctx) => {
  const queueId = ctx.view.entityId;
  if (!queueId) return null;

  const queue = await getQueue(queueId);

  return queue ? { domain: 'queue', id: queue.id, guild: queue.guild } : null;
};

/** The queue that owns the entry a panel is bound to. */
export const queueOfEntry: Locator = async (ctx) => {
  const entryId = ctx.view.entityId;
  if (!entryId) return null;

  const entry = await getQueueEntry(entryId);
  if (!entry) return null;

  const queue = await getQueue(entry.queue);

  return queue ? { domain: 'queue', id: queue.id, guild: queue.guild } : null;
};

/**
 * The Storyteller who created the entry may manage it; so may a Moderator or
 * Manager (`queue.manage_entries`).
 *
 * One guard rather than two composed, so the entry is fetched once and the
 * refusal names the Storyteller rule, which is the one most people will meet.
 */
export const canManageEntry: ViewGuard = async (interaction, ctx) => {
  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;

  const entry = ctx.view.entityId ? await getQueueEntry(ctx.view.entityId) : undefined;
  if (!entry) return S.errors.notHere;

  if (entry.storyteller === actor.id) return true;

  const queue = await getQueue(entry.queue);
  if (!queue || !inSameGuild(queue.guild, interaction.guildId)) return S.errors.notHere;

  const verdict = await accessAllows(queue.guild, actor, Permissions.Queue.ManageEntries);

  return verdict.ok ? true : S.errors.notStoryteller;
};

/**
 * The Storyteller whose entry is at the front of the queue, counting only
 * entries that are ready to start. The claim is theirs alone: a maintainer
 * who wants to hand the slot elsewhere raises the cap and lets the offer run.
 */
export const frontOfQueue: ViewGuard = async (interaction, ctx) => {
  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;

  const queue = ctx.view.entityId ? await getQueue(ctx.view.entityId) : undefined;
  if (!queue || !inSameGuild(queue.guild, interaction.guildId)) return S.errors.notHere;

  const front = nextClaimant(await listQueueEntries(queue.id), [], new Date());

  return front?.storyteller === actor.id ? true : S.errors.notFrontOfQueue;
};

/**
 * The presser may enter this queue as a Storyteller: the server's Storyteller
 * roles and the queue's own, where set (`mayJoinAs`). On entering and again on
 * claiming, so a role taken away in between cannot claim a slot.
 */
export const mayStorytellIn: ViewGuard = async (interaction, ctx) => {
  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;

  const queue = ctx.view.entityId ? await getQueue(ctx.view.entityId) : undefined;
  if (!queue || !inSameGuild(queue.guild, interaction.guildId)) return S.errors.notHere;

  const verdict = await mayJoinAs(queue.guild, actor, queue, 'Storyteller');
  return verdict.ok ? true : verdict.reason;
};
