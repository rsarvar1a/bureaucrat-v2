import type { Client } from 'discord.js';
import { notifyContexts } from '../../../engine/discord/views/notify';

/**
 * Raises concrete labels from outside any view. The registry is imported
 * lazily, as `end.ts` does, because it imports every view and the views
 * import this tree.
 */
export const publish = async (client: Client, labels: string[]): Promise<void> => {
  if (labels.length === 0) return;
  const { viewDefinitions } = await import('../registry/views');
  await notifyContexts(client, viewDefinitions, labels);
};
