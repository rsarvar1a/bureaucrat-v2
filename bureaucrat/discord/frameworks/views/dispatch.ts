import { eq } from 'drizzle-orm';
import {
  MessageFlags,
  MessagePayload,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { parseCustomId } from './custom-id';
import { notifyContexts, resolveEventTemplate } from './notify';
import { spawnView as spawnViewFn } from './lifecycle';
import type { InteractionHandler, ViewContext, ViewDefinition, ViewRow } from './types';
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

  const ids: Record<string, string> = { [viewDef.id]: viewInstanceId };
  for (let i = 0; i < viewDef.idParams.length; i++) {
    const paramName = viewDef.idParams[i]!;
    const value = parsed.ids[i + 1];
    if (value) ids[paramName] = value;
  }

  const resolve = (...templates: string[]): string[] => templates.map((t) => resolveEventTemplate(t, ids));

  const ctx: ViewContext<unknown> = {
    view: viewRow as ViewRow,
    ids,
    async updateState(patch) {
      const currentState = (viewRow.state ?? {}) as Record<string, unknown>;
      const newState = { ...currentState, ...patch };
      await db.update(View).set({ state: newState }).where(eq(View.id, viewRow.id));
      (viewRow as ViewRow).state = newState;
      ctx.view = { ...viewRow, state: newState } as ViewRow;
    },
    async notify(...templates) {
      await notifyContexts(interaction.client, definitions, resolve(...templates), { excludeViewId: viewRow.id });
    },
    async notifyAll(...templates) {
      await notifyContexts(interaction.client, definitions, resolve(...templates));
    },
    async mutateAndNotify(patch, ...templates) {
      await ctx.updateState(patch);
      await ctx.notify(...templates);
    },
    async spawnView(viewId, target, options) {
      const def = definitions.get(viewId);
      if (!def) throw new Error(`Unknown view "${viewId}"`);
      return spawnViewFn(def, target, options);
    },
  };

  try {
    const result = await handler(interaction, ctx);

    if (result && result.action === 'rerender') {
      const payload = await viewDef.render(ctx.view, db);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      await interaction.editReply(payload as MessagePayload);
    }
  } catch (error) {
    logger.error({ message: `Error in view interaction ${handlerKey}.`, error });
    await replySafely(interaction, {
      content: 'An error occurred while processing this interaction.',
      flags: [MessageFlags.Ephemeral],
    });
  }
};
