import { eq } from 'drizzle-orm';
import { MessageFlags } from 'discord.js';
import type { MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { parseCustomId } from './custom-id';
import { resolveAncestry } from './ancestry';
import { createViewContext } from './view-context';
import { lifecycleHandlers } from './events/index';
import type { InteractionHandler, ViewDefinition, ViewRow } from './types';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';
import { logger } from '../../../utilities/logger';
import { replySafely } from '../../../utilities/reply';

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
  const handler = handlers.get(handlerKey);
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

  // Refresh the webhook token for ephemeral views so it stays current across interactions
  if (viewRow.visibility === 'ephemeral') {
    const freshToken = interaction.token;
    await db.update(View).set({ webhookToken: freshToken }).where(eq(View.id, viewRow.id));
    (viewRow as ViewRow).webhookToken = freshToken;
  }

  const ctx = createViewContext({ viewRow: viewRow as ViewRow, ids, interaction, definitions });

  try {
    const result = await handler(interaction, ctx);

    const lifecycleHandler =
      result?.action && result.action !== 'noop' ? lifecycleHandlers.find((h) => h.event === result.action) : null;

    if (lifecycleHandler) {
      await lifecycleHandler.execute({ view: ctx.view, def: viewDef, client: interaction.client, interaction });
    }
  } catch (error) {
    logger.error({ message: `Error in view interaction ${handlerKey}.`, error });
    await replySafely(interaction, {
      content: 'An error occurred while processing this interaction.',
      flags: [MessageFlags.Ephemeral],
    });
  }
};
