import { eq, inArray } from 'drizzle-orm';
import type { Client, MessagePayload, TextChannel } from 'discord.js';
import { db } from '../../../utilities/db';
import { View, Subscription } from '../../../schema/abc/views.sql';
import type { ViewDefinition, ViewRow } from './types';
import { logger } from '../../../utilities/logger';

/**
 * Resolves an event template string by replacing `${placeholder}` with values from the IDs map.
 */
export const resolveEventTemplate = (template: string, ids: Record<string, string>): string => {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => {
    const value = ids[key];
    if (value === undefined) {
      throw new Error(`Missing ID "${key}" when resolving event template "${template}"`);
    }
    return value;
  });
};

type NotifyOptions = {
  excludeViewId?: string;
};

/**
 * Notifies all views subscribed to the given context labels by re-rendering them.
 *
 * Pass `excludeViewId` to skip a view that is already being re-rendered
 * via the current interaction (e.g., the view whose button was clicked).
 */
export const notifyContexts = async (
  client: Client,
  definitions: Map<string, ViewDefinition>,
  contextLabels: string[],
  options: NotifyOptions = {},
): Promise<void> => {
  if (contextLabels.length === 0) return;

  // Find all views subscribed to any of the given context labels
  const subscriptions = await db
    .select({ viewId: Subscription.view })
    .from(Subscription)
    .where(inArray(Subscription.contextLabel, contextLabels));

  if (subscriptions.length === 0) return;

  const viewIds = [...new Set(subscriptions.map((s) => s.viewId))].filter((id) => id !== options.excludeViewId);

  const views = await db.select().from(View).where(inArray(View.id, viewIds));

  for (const view of views) {
    const viewDef = definitions.get(view.route);
    if (!viewDef) {
      logger.warn({ message: `No view definition found for route "${view.route}", skipping re-render.` });
      continue;
    }

    try {
      const payload = (await viewDef.render(view as ViewRow<unknown>, db)) as MessagePayload;

      if (view.visibility === 'public') {
        const channel = (await client.channels.fetch(String(view.channel))) as TextChannel | null;
        if (!channel) {
          logger.warn({ message: `Channel ${view.channel} not found, destroying view ${view.id}.` });
          await destroyViewRow(view.id);
          continue;
        }

        await channel.messages.edit(String(view.message), payload);
      } else if (view.webhookToken) {
        // Ephemeral views use webhook token to edit the original interaction response
        const { WebhookClient } = await import('discord.js');
        const webhook = new WebhookClient({ url: view.webhookToken });
        await webhook.editMessage(String(view.message), payload);
      }
    } catch (error) {
      logger.error({ message: `Failed to re-render view ${view.id}, destroying.`, error });
      await destroyViewRow(view.id);
    }
  }
};

const destroyViewRow = async (viewId: string) => {
  await db.delete(View).where(eq(View.id, viewId));
};
