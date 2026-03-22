import { inArray } from 'drizzle-orm';
import type { Client } from 'discord.js';
import { db } from '../../../utilities/db';
import { View, Subscription } from '../../../schema/abc/views.sql';
import type { ViewDefinition, ViewRow } from './types';
import { lifecycleHandlers } from './events/index';
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

  logger.debug({ message: `Processing ${contextLabels.length} context event(s).`, contextLabels });

  // Find all views subscribed to any of the given context labels, including the action
  const subscriptions = await db
    .select({ viewId: Subscription.view, action: Subscription.action })
    .from(Subscription)
    .where(inArray(Subscription.contextLabel, contextLabels));

  if (subscriptions.length === 0) return;

  logger.debug({ message: `Resolving ${subscriptions.length} subscription(s).`, subscriptions });

  // Determine the strongest action per view: destroy > render
  const viewActionMap = new Map<string, 'render' | 'destroy'>();
  for (const s of subscriptions) {
    if (s.viewId === options.excludeViewId) continue;
    const current = viewActionMap.get(s.viewId);
    if (s.action === 'destroy' || !current) {
      viewActionMap.set(s.viewId, s.action as 'render' | 'destroy');
    }
  }

  if (viewActionMap.size === 0) return;

  const views = await db
    .select()
    .from(View)
    .where(inArray(View.id, [...viewActionMap.keys()]));

  logger.debug({
    message: `Notifying ${views.length} view(s).`,
    views: views.map((v) => `${v.route}|${v.id}`).join(', '),
  });

  const lifecycleEvents = views.map((v) => ({
    view: v,
    def: definitions.get(v.route),
    action: viewActionMap.get(v.id),
  }));

  // Process each lifecycle handler in precedence order (destroy before render)
  for (const handler of lifecycleHandlers) {
    await Promise.allSettled(
      lifecycleEvents
        .filter(({ action }) => action === handler.event)
        .map(({ view, def }) => {
          logger.debug({ message: `Processing a ${handler.event} on ${view.route} ${view.id}.` });
          if (!def) {
            logger.warn({ message: `No view definition found for route "${view.route}", skipping.` });
            return Promise.resolve();
          }
          return handler.execute({ view: view as unknown as ViewRow, def, client });
        }),
    );
  }
};
