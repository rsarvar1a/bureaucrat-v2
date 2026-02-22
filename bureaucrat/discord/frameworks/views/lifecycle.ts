import { lt, eq, and, isNotNull } from 'drizzle-orm';
import type {
  Message,
  MessagePayload,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from 'discord.js';
import { db } from '../../../utilities/db';
import { View, Subscription } from '../../../schema/abc/views.sql';
import type { ViewDefinition, ViewRow } from './types';
import { resolveEventTemplate } from './notify';
import { logger } from '../../../utilities/logger';

const SWEEP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Where and how to send the view message.
 *
 * - `interaction`: the interaction to reply through (required).
 * - `messageId`: if set, the view is sent as a reply to this message
 *   (creating a reply chain). Otherwise it's sent as the interaction reply.
 */
export type SpawnTarget = {
  interaction: RepliableInteraction | MessageComponentInteraction | ModalSubmitInteraction;
  messageId?: string;
};

export type SpawnOptions = {
  ids?: Record<string, string>;
  entityId?: string;
  state?: unknown;
  visibility?: 'public' | 'ephemeral';
  expiresAt?: Date;
  webhookToken?: string;
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
    expiresAt,
    webhookToken,
  } = options;

  const viewId = crypto.randomUUID();
  const ids = { [viewDef.id]: viewId, ...callerIds };

  const tempView = {
    id: viewId,
    route: viewDef.id,
    state: state ?? null,
    entityId: entityId ?? null,
    visibility,
    expiresAt: expiresAt ?? null,
    webhookToken: webhookToken ?? null,
    channel: 0n,
    message: 0n,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ViewRow;

  const payload = (await viewDef.render(tempView, db)) as MessagePayload;
  const { interaction, messageId } = target;
  const ephemeral = visibility === 'ephemeral';

  const sent: Message = messageId
    ? await interaction.channel!.messages.fetch(messageId).then((msg) => msg.reply(payload))
    : interaction.deferred
      ? await interaction.editReply(payload)
      : ((await interaction.reply({
          ...payload,
          ephemeral,
          fetchReply: true,
        } as unknown as MessagePayload)) as unknown as Message);

  const [row] = await db
    .insert(View)
    .values({
      id: viewId,
      route: viewDef.id,
      state: state ?? null,
      entityId: entityId ?? null,
      visibility,
      expiresAt: expiresAt ?? null,
      webhookToken: webhookToken ?? null,
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

  return { ...row!, state: state ?? null } as ViewRow;
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
