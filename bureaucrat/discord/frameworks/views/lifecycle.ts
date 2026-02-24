import { lt, eq, and, isNotNull } from 'drizzle-orm';
import type {
  Message,
  MessagePayload,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
  TextBasedChannel,
} from 'discord.js';
import { db } from '../../../utilities/db';
import { View, Subscription } from '../../../schema/abc/views.sql';
import type { ViewDefinition, ViewRow } from './types';
import { injectCustomId } from './custom-id';
import { resolveEventTemplate } from './notify';
import { logger } from '../../../utilities/logger';

const SWEEP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Where and how to send the view message.
 *
 * - `interaction`: the interaction to reply through (required).
 * - `messageId`: if set, the view is sent as a reply to this message
 *   (creating a reply chain). Otherwise it's sent as the interaction reply.
 * - `channel`: if set, the view is sent directly to this channel via
 *   `channel.send()`. The caller is responsible for handling the interaction
 *   separately (e.g., with an ephemeral confirmation).
 */
export type SpawnTarget = {
  interaction: RepliableInteraction | MessageComponentInteraction | ModalSubmitInteraction;
  messageId?: string;
  channel?: TextBasedChannel;
};

export type SpawnOptions = {
  ids?: Record<string, string>;
  entityId?: string;
  state?: unknown;
  visibility?: 'public' | 'ephemeral';
  expiresAt?: Date;
  webhookToken?: string;
  member?: bigint;
  persistent?: boolean;
};

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
    state = viewDef.defaultState,
    visibility = 'public',
    expiresAt: explicitExpiresAt,
    webhookToken,
    member: explicitMember,
    persistent,
  } = options;

  const viewId = crypto.randomUUID();
  const ids = { [viewDef.id]: entityId ?? viewId, ...callerIds };
  const resolvedWebhookToken = webhookToken ?? (visibility === 'ephemeral' ? target.interaction.webhook.url : null);
  const member = explicitMember ?? (visibility === 'ephemeral' ? BigInt(target.interaction.user.id) : null);

  // Auto-expire ephemeral views unless explicitly persistent or an expiresAt is set
  let expiresAt = explicitExpiresAt ?? null;
  if (visibility === 'ephemeral' && !explicitExpiresAt && !persistent) {
    const timeoutMs = Number(process.env.TEMPORARY_VIEW_TIMEOUT_MS) || 600_000;
    expiresAt = new Date(Date.now() + timeoutMs);
  }

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
    entityId: entityId ?? null,
    visibility,
    expiresAt,
    webhookToken: resolvedWebhookToken ?? null,
    member: member ?? null,
    channel: 0n,
    message: 0n,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const payload = (await viewDef.render(tempView, db)) as MessagePayload;
  const { interaction, messageId, channel } = target;
  const ephemeral = visibility === 'ephemeral';

  let sent: Message;

  if (channel && 'send' in channel) {
    sent = await (channel as Extract<TextBasedChannel, { send: unknown }>).send(payload as never);
  } else if (messageId) {
    sent = await interaction.channel!.messages.fetch(messageId).then((msg) => msg.reply(payload));
  } else if (interaction.deferred) {
    sent = await interaction.editReply(payload);
  } else {
    sent = (await interaction.reply({
      ...payload,
      ephemeral,
      fetchReply: true,
    } as unknown as MessagePayload)) as unknown as Message;
  }

  const [row] = await db
    .insert(View)
    .values({
      id: viewId,
      route: viewDef.id,
      state: state ?? null,
      entityId: entityId ?? null,
      visibility,
      expiresAt,
      webhookToken: resolvedWebhookToken ?? null,
      member: member ?? null,
      channel: BigInt(sent.channelId),
      message: BigInt(sent.id),
    })
    .returning();

  const contextLabels = viewDef.subscribesTo.map((key) => resolveEventTemplate(viewDef.events[key]!, ids));

  if (contextLabels.length > 0) {
    await db.insert(Subscription).values(
      contextLabels.map((label) => ({
        view: row!.id,
        contextLabel: label,
      })),
    );
  }

  return injectCustomId({ ...row!, state: state ?? null });
};

/**
 * Destroys a view instance (cascades to subscriptions).
 */
export const destroyView = async (viewId: string): Promise<void> => {
  await db.delete(View).where(eq(View.id, viewId));
};

/**
 * Deletes all views whose expiresAt has passed. Does not
 * target any persistent views.
 */
export const sweepExpiredViews = async (): Promise<void> => {
  const deleted = await db
    .delete(View)
    .where(and(isNotNull(View.expiresAt), lt(View.expiresAt, new Date())))
    .returning({ id: View.id });

  if (deleted.length > 0) {
    logger.info({ message: `Swept ${deleted.length} expired view(s).` });
  }
};

/**
 * Starts the periodic sweep interval. Returns the interval handle.
 */
export const startSweepInterval = (): ReturnType<typeof setInterval> => {
  logger.info({ message: `Starting view expiry sweep (every ${SWEEP_INTERVAL_MS / 1000}s).` });
  return setInterval(() => {
    sweepExpiredViews().catch((error) => {
      logger.error({ message: 'Error during view expiry sweep.', error });
    });
  }, SWEEP_INTERVAL_MS);
};
