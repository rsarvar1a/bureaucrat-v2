import { eq } from 'drizzle-orm';
import { injectCustomId } from './custom-id';
import { notifyContexts, resolveEventTemplate } from './notify';
import { spawnView as spawnViewFn } from './lifecycle';
import type { ViewContext, ViewDefinition, ViewInteraction, ViewRow } from './types';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';

export const createViewContext = (params: {
  viewRow: ViewRow;
  ids: Record<string, string>;
  interaction: ViewInteraction;
  definitions: Map<string, ViewDefinition>;
}): ViewContext<unknown> => {
  const { viewRow, ids, interaction, definitions } = params;

  const resolve = (...templates: string[]): string[] => templates.map((t) => resolveEventTemplate(t, ids));

  const ctx: ViewContext<unknown> = {
    view: injectCustomId(viewRow),
    ids,
    async updateState(patch) {
      const currentState = (viewRow.state ?? {}) as Record<string, unknown>;
      const newState = { ...currentState, ...patch };
      await db.update(View).set({ state: newState }).where(eq(View.id, viewRow.id));
      (viewRow as ViewRow).state = newState;
      ctx.view = injectCustomId({ ...viewRow, state: newState });
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
      return spawnViewFn(def, target, { parent: viewRow.id, ...options });
    },
  };

  return ctx;
};
