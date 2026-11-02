import { eq } from 'drizzle-orm';
import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from 'discord.js';
import type { Client, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { parseCustomId } from './custom-id';
import { resolveAncestry } from './ancestry';
import { createViewContext } from './view-context';
import { markViewActive } from './activity';
import { lifecycleHandlers } from './events';
import { destroyView } from './lifecycle';
import type { InteractionHandler, ViewDefinition, ViewRow } from './types';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';
import { logger } from '../../../utilities/logger';
import { S } from '../../../strings';
import { replySafely } from '../reply';

const messageExists = async (client: Client, viewRow: { channel: bigint; message: bigint }): Promise<boolean> => {
  const channel = await client.channels.fetch(String(viewRow.channel)).catch(() => null);
  if (!channel || !('messages' in channel)) return false;
  return channel.messages
    .fetch(String(viewRow.message))
    .then(() => true)
    .catch(() => false);
};

/**
 * Dispatches a component/modal interaction to the appropriate view handler.
 */
export const dispatch = async (
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  handlers: Map<string, InteractionHandler<unknown>>,
  definitions: Map<string, ViewDefinition>,
): Promise<void> => {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const pathParts = parsed.path.split('::');
  if (pathParts[0] !== 'view' || pathParts.length < 2) return;

  const viewId = pathParts[1]!;
  const handlerKey = `view::${viewId}::${parsed.action}`;

  // Fall back to a `'*'` handler for actions a view cannot enumerate when it is
  // defined - a console routing buttons that authored content supplies.
  const handler = handlers.get(handlerKey) ?? handlers.get(`view::${viewId}::*`);
  const viewDef = definitions.get(viewId);
  const viewInstanceId = parsed.ids[0];
  const [viewRow] = viewInstanceId
    ? await db
        .select()
        .from(View)
        .where(eq(View.id, viewInstanceId ?? ''))
    : [];

  if (!handler || !viewDef || !viewInstanceId || !viewRow) {
    return;
  }

  // Resolve ancestry IDs (root → self), then overlay self + idParams on top
  const ancestry = await resolveAncestry(viewRow.id);
  const ids: Record<string, string> = { ...ancestry.ids, [viewDef.id]: viewInstanceId };
  if (viewRow.entityId) ids[viewDef.id] = viewRow.entityId;
  for (let i = 0; i < viewDef.idParams.length; i++) {
    const paramName = viewDef.idParams[i]!;
    const value = parsed.ids[i + 1];
    if (value) ids[paramName] = value;
  }

  const ctx = createViewContext({ viewRow: viewRow as ViewRow, ids, action: parsed.action, interaction, definitions });

  // Authorization runs after the context exists, so guards can consult view
  // state, ancestry ids, and the database. `'*'` guards apply to every action.
  const guards = [...(viewDef.guards['*'] ?? []), ...(viewDef.guards[parsed.action] ?? [])];
  for (const guard of guards) {
    let verdict: true | string;

    try {
      verdict = await guard(interaction, ctx);
    } catch (error) {
      logger.error({ message: `Error in guard for ${handlerKey}.`, error });
      verdict = S.common.guardFailed;
    }

    if (verdict !== true) {
      await replySafely(interaction, { content: verdict, flags: [MessageFlags.Ephemeral] });
      return;
    }
  }

  /**
   * The one place an interaction is recorded as activity.
   *
   * After the guards, so that a press rejected as somebody else's does not keep
   * their session alive. Before the handler, so a handler that throws still
   * counts - the player was here either way.
   *
   * An ephemeral's webhook token is refreshed in the same statement, since it
   * has to stay current across interactions and this is already the write.
   */
  const freshToken = viewRow.visibility === 'ephemeral' ? interaction.token : null;
  await markViewActive(viewRow as ViewRow, freshToken ? { webhookToken: freshToken } : {});
  if (freshToken) (viewRow as ViewRow).webhookToken = freshToken;

  try {
    const result = await handler(interaction, ctx);

    const lifecycleHandler =
      result?.action && result.action !== 'noop' ? lifecycleHandlers.find((h) => h.event === result.action) : null;

    if (lifecycleHandler) {
      await lifecycleHandler.execute({ view: ctx.view, def: viewDef, client: interaction.client, interaction });
    }
  } catch (error) {
    // The message this view lived on is gone (an ephemeral dismissed or
    // superseded, say): the row goes with it, and whoever pressed is told
    // to open the pane again. Whatever the handler did before the edit stands.
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
      // An Unknown Message may be some other message - a modal's missing
      // reply, say - so a public card is checked before its row goes; a row
      // destroyed in error leaves a live message with dead buttons.
      if (viewRow.visibility === 'ephemeral' || !(await messageExists(interaction.client, viewRow))) {
        logger.warn({ message: `The message of view ${viewRow.id} (${handlerKey}) is gone; destroying the view.` });
        await destroyView(viewRow.id);
        await replySafely(interaction, { content: S.common.viewGone, flags: [MessageFlags.Ephemeral] });
        return;
      }
    }
    logger.error({ message: `Error in view interaction ${handlerKey}.`, error });
    await replySafely(interaction, {
      content: S.common.interactionFailed,
      flags: [MessageFlags.Ephemeral],
    });
  }
};
