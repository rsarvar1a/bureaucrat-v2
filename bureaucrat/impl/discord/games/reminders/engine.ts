import type { Client } from 'discord.js';
import { listPendingReminders, markPosted, type ReminderRow } from '../../../../drizzle/reminders';
import { getGame } from '../../../../drizzle/games';
import { logger } from '../../../../utilities/logger';
import { roleMentions, trackedRoles } from '../roles';
import { linear, text, v2 } from '../../../../engine/discord/elements';
import { dueOffsets, quoted, reminderHeader } from './schedule';

/** How often pending reminders are checked; a reminder is late by at most this. */
export const TICK_MS = 15_000;

// A container rather than raw content: a text display pings its mentions the
// same way, within what `allowedMentions` permits, and quotes the message.
const post = async (client: Client, reminder: ReminderRow): Promise<boolean> => {
  const channel = await client.channels.fetch(String(reminder.channel)).catch(() => null);
  if (!channel || !('send' in channel)) return false;

  const mentions = roleMentions(reminder.mentions, await trackedRoles(reminder.game));
  await channel.send({
    ...v2(linear(text(reminderHeader(reminder.fireAt, mentions.text)), text(quoted(reminder.message)))),
    allowedMentions: { roles: mentions.ids },
  });
  return true;
};

/**
 * One pass over every pending reminder: whatever is due goes out, the latest
 * of several due at once, and all of them are recorded. A reminder whose game
 * has ended is quietly retired.
 */
export const tickReminders = async (client: Client, now = new Date()): Promise<void> => {
  for (const reminder of await listPendingReminders()) {
    const due = dueOffsets(reminder, now);
    if (due.length === 0) continue;

    const game = await getGame(reminder.game);
    if (!game || game.state === 'completed') {
      await markPosted(reminder.id, [...reminder.offsets, 0]);
      continue;
    }

    try {
      const sent = await post(client, reminder);
      if (!sent) logger.warn({ message: `Reminder ${reminder.id}: channel ${reminder.channel} is unreachable.` });
    } catch (error) {
      logger.warn({ message: `Reminder ${reminder.id} could not be posted.`, error });
    }

    await markPosted(reminder.id, due);
  }
};

export const startReminderEngine = (client: Client): ReturnType<typeof setInterval> => {
  const run = () => tickReminders(client).catch((error) => logger.error({ message: 'Reminder tick failed.', error }));
  void run();
  return setInterval(run, TICK_MS);
};
