import { eq } from 'drizzle-orm';
import type { Message, PartialMessage } from 'discord.js';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';
import { logger } from '../../../utilities/logger';

/**
 * Drops view rows whose message was deleted.
 *
 * Without this the row survives its message, and every later re-render fails
 * against a message that no longer exists - the framework does eventually
 * destroy such a view, but only after an attempted edit and an error log.
 * Removing it up front keeps that noise out of the logs and the table clean.
 */
export default async function onMessageDelete(message: Message | PartialMessage) {
  try {
    const deleted = await db
      .delete(View)
      .where(eq(View.message, BigInt(message.id)))
      .returning({ id: View.id, route: View.route });

    if (deleted.length > 0) {
      logger.debug({
        message: `Dropped ${deleted.length} view(s) whose message was deleted: ${deleted
          .map((view) => view.route)
          .join(', ')}.`,
      });
    }
  } catch (error) {
    logger.error({ message: `Failed to clean up views for deleted message ${message.id}.`, error });
  }
}
