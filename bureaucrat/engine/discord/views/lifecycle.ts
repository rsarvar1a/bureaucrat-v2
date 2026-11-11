import { lt, eq, and } from 'drizzle-orm';
import {
  type Client,
  type Message,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type TextBasedChannel,
  type GuildTextBasedChannel,
  WebhookClient,
} from 'discord.js';
import { db } from '../../../utilities/db';
import { View, Subscription } from '../../../schema/abc/views.sql';
import type { LifecycleAction, ViewDefinition, ViewRow } from './types';
import { injectCustomId } from './custom-id';
import { resolveEventTemplate } from './notify';
import { resolveAncestry } from './ancestry';
import { logger } from '../../../utilities/logger';
import { writable } from './threads';
import { stripControls } from './strip';

const SWEEP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Where and how to send the view message.
 *
 * - `interaction`: the interaction to reply through.
 * - `messageId`: if set, the view is sent as a reply to this message
 *   (creating a reply chain). Otherwise it's sent as the interaction reply.
 * - `channel`: if set, the view is sent directly to this channel via
 *   `channel.send()`. The caller is responsible for handling the interaction
 *   separately (e.g., with an ephemeral confirmation).
 *
 * A timer has no interaction: it gives the client and the channel instead,
 * and may only spawn a public view there.
 */
export type SpawnTarget =
  | {
      interaction: RepliableInteraction | MessageComponentInteraction | ModalSubmitInteraction;
      messageId?: string;
      channel?: TextBasedChannel;
    }
  | { client: Client; channel: TextBasedChannel };

export const clientOf = (target: SpawnTarget): Client =>
  'interaction' in target ? target.interaction.client : target.client;

export type SpawnOptions = {
  ids?: Record<string, string>;
  entityId?: string;
  state?: unknown;
  visibility?: 'public' | 'ephemeral';
  webhookToken?: string;
  member?: bigint;
  persistent?: boolean;
  parent?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A caller's state over the definition's defaults.
 *
 * Merged rather than replaced. A caller supplying only the fields it knows
 * about - `{ guild }` for a panel scoped to one guild - would otherwise leave
 * every other field undefined, so a view whose default picks an opening tab
 * would open on no tab at all.
 *
 * Anything that is not a plain object cannot be merged into, so the caller's
 * value simply wins.
 */
export const mergeState = (defaults: unknown, caller: unknown): unknown =>
  isRecord(defaults) && isRecord(caller) ? { ...defaults, ...caller } : (caller ?? defaults);

/**
 * Spawns a view instance: renders, sends to Discord, persists to DB, and subscribes.
 *
 * The view's own UUID is generated up front and injected into the ids map
 * under the view definition's `id` key (e.g., a "counter" view gets
 * `{ counter: "<uuid>" }`). Callers can supply additional domain-specific
 * ids via `options.ids`; these are merged in (caller wins on conflict).
 */
export const spawnView = async (
  viewDef: ViewDefinition,
  target: SpawnTarget,
  options: SpawnOptions = {},
): Promise<ViewRow> => {
  const {
    ids: callerIds = {},
    entityId,
    state: callerState,
    visibility = 'public',
    webhookToken,
    member: explicitMember,
    persistent,
    parent,
  } = options;

  const state = mergeState(viewDef.defaultState, callerState);

  const viewId = crypto.randomUUID();
  const ancestry = parent ? await resolveAncestry(parent) : null;
  const ancestorIds = ancestry?.ids ?? {};
  const parentEntityId = ancestry?.entityId ?? null;
  const resolvedEntityId = entityId ?? parentEntityId ?? null;
  const ids = { ...ancestorIds, [viewDef.id]: resolvedEntityId ?? viewId, ...callerIds };
  // Kept on the row, so every later interaction resolves the same ids the spawn did.
  const storedIds = Object.keys(callerIds).length > 0 ? callerIds : null;
  const interaction = 'interaction' in target ? target.interaction : null;
  if (visibility === 'ephemeral' && !interaction) {
    throw new Error(`An ephemeral view ("${viewDef.id}") needs an interaction to answer.`);
  }
  const member = explicitMember ?? (visibility === 'ephemeral' && interaction ? BigInt(interaction.user.id) : null);

  // Ephemerals are collected once they go idle; `persistent` opts out. The
  // window itself is not stored - it is `updatedAt` plus the configured
  // timeout, so it moves with every interaction rather than with the spawn.
  const autoExpires = visibility === 'ephemeral' && !persistent;

  // Invalidate existing ephemeral views for the same route + member
  if (visibility === 'ephemeral' && member != null) {
    const stale = await db
      .delete(View)
      .where(and(eq(View.route, viewDef.id), eq(View.member, member), eq(View.visibility, 'ephemeral')))
      .returning({ id: View.id });
    if (stale.length > 0) {
      logger.info({ message: `Invalidated ${stale.length} stale ephemeral view(s) for route "${viewDef.id}".` });
    }
  }

  const tempView = injectCustomId({
    id: viewId,
    route: viewDef.id,
    state: state ?? null,
    entityId: resolvedEntityId,
    ids: storedIds,
    parent: parent ?? null,
    visibility,
    autoExpires,
    webhookToken: null,
    member: member ?? null,
    // Where the message will land, so a first render can tell a private thread from a public one.
    channel: BigInt(target.channel?.id ?? interaction?.channelId ?? 0),
    message: 0n,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const payload = await viewDef.render(tempView, db, clientOf(target));
  const { channel } = target;
  const messageId = 'interaction' in target ? target.messageId : undefined;
  const ephemeral = visibility === 'ephemeral';

  let sent: Message;
  let resolvedWebhookToken: string | null = webhookToken ?? null;

  if (channel && 'send' in channel) {
    // A thread may have archived since somebody last spoke in it, and the bot
    // may not be a member of a private one. Both refuse a write in silence.
    await writable(channel);
    sent = await (channel as Extract<TextBasedChannel, { send: unknown }>).send(payload as never);
  } else if (!interaction) {
    throw new Error(`A view ("${viewDef.id}") spawned without an interaction needs a channel that can be sent to.`);
  } else if (messageId) {
    sent = await interaction.channel!.messages.fetch(messageId).then((msg) => msg.reply(payload as never));
  } else if (interaction.deferred) {
    sent = await interaction.editReply(payload as never);
    if (ephemeral && !resolvedWebhookToken) resolvedWebhookToken = interaction.token;
  } else {
    sent = (await interaction.reply({
      ...payload,
      ephemeral,
      fetchReply: true,
    } as never)) as unknown as Message;
    if (ephemeral && !resolvedWebhookToken) resolvedWebhookToken = interaction.token;
  }

  const [row] = await db
    .insert(View)
    .values({
      id: viewId,
      route: viewDef.id,
      state: state ?? null,
      entityId: resolvedEntityId,
      ids: storedIds,
      parent: parent ?? null,
      visibility,
      autoExpires,
      webhookToken: resolvedWebhookToken ?? null,
      member: member ?? null,
      channel: BigInt(sent.channelId),
      message: BigInt(sent.id),
    })
    .returning();

  const subscriptionRows: { view: string; contextLabel: string; action: LifecycleAction }[] = [];
  for (const [action, templates] of Object.entries(viewDef.subscribesTo) as [LifecycleAction, string[]][]) {
    for (const template of templates) {
      subscriptionRows.push({
        view: row!.id,
        contextLabel: resolveEventTemplate(template, ids),
        action,
      });
    }
  }

  if (subscriptionRows.length > 0) {
    await db.insert(Subscription).values(subscriptionRows);
  }

  return injectCustomId({ ...row!, state: state ?? null });
};

/**
 * Deletes the Discord message associated with a view.
 * Handles both public (channel message) and ephemeral (webhook) views.
 */
export const deleteViewMessage = async (view: ViewRow, client: Client): Promise<void> => {
  try {
    if (view.visibility === 'ephemeral' && view.webhookToken) {
      const webhook = new WebhookClient({ id: client.application!.id, token: view.webhookToken });
      await webhook.deleteMessage(String(view.message));
    } else {
      const channel = (await client.channels.fetch(String(view.channel))) as GuildTextBasedChannel | null;
      if (channel) {
        await writable(channel);
        await channel.messages.delete(String(view.message));
      }
    }
  } catch (error) {
    logger.debug({ message: 'Ignoring error in deleteViewMessage:', error });
  }
};

/**
 * Takes the controls off a public view's message and leaves the rest where it
 * is; a message that was nothing but controls is deleted instead, since an
 * edit cannot leave a message empty.
 */
export const detachViewMessage = async (view: ViewRow, client: Client): Promise<void> => {
  try {
    const channel = (await client.channels.fetch(String(view.channel))) as GuildTextBasedChannel | null;
    if (!channel) return;
    await writable(channel);

    const message = await channel.messages.fetch(String(view.message));
    const before = message.components.map((component) => component.toJSON());
    const after = stripControls(before);

    if (after.length === 0 && !message.content && message.embeds.length === 0) await message.delete();
    else if (JSON.stringify(after) !== JSON.stringify(before)) await message.edit({ components: after as never });
  } catch (error) {
    logger.debug({ message: 'Ignoring error in detachViewMessage:', error });
  }
};

/**
 * Destroys a view instance (cascades to subscriptions).
 */
export const destroyView = async (viewId: string): Promise<void> => {
  await db.delete(View).where(eq(View.id, viewId));
};

/**
 * Deletes views that have gone untouched for the timeout window.
 *
 * The window is measured from `updatedAt` - the last interaction - and never
 * from creation, so a view someone is actively using is never collected. Every
 * dispatched interaction refreshes it; see `markViewActive`.
 */
export const sweepStaleViews = async (): Promise<void> => {
  const timeoutMs = Number(process.env.TEMPORARY_VIEW_TIMEOUT_MS) || 600_000;
  const cutoff = new Date(Date.now() - timeoutMs);

  const deleted = await db
    .delete(View)
    .where(and(eq(View.autoExpires, true), lt(View.updatedAt, cutoff)))
    .returning({ id: View.id });

  if (deleted.length > 0) {
    logger.info({ message: `Swept ${deleted.length} stale view(s).` });
  }
};

/**
 * Starts the periodic sweep interval. Returns the interval handle.
 */
export const startSweepInterval = (): ReturnType<typeof setInterval> => {
  logger.info({ message: `Starting stale view sweep (every ${SWEEP_INTERVAL_MS / 1000}s).` });
  return setInterval(() => {
    sweepStaleViews().catch((error) => {
      logger.error({ message: 'Error during stale view sweep.', error });
    });
  }, SWEEP_INTERVAL_MS);
};
