import type { Client } from 'discord.js';
import { logger } from '../../../utilities/logger';
import { startReminderEngine } from '../games/reminders/engine';
import { startNominationEngine } from '../games/nominations/engine';
import { startOffsiteEngine } from '../games/offsite/engine';
import { restoreChannelOverwrites } from '../games/roles';

export default async function onClientReady(client: Client) {
  logger.info({ message: `Logged in as ${client.user?.tag}!` });

  // Application emoji do not arrive over the gateway; fetched once so the
  // emote finder sees them (`/admin emoji` adds to the same cache).
  const emojis = await client.application?.emojis.fetch().catch(() => null);
  if (emojis) logger.info({ message: `${emojis.size} application emoji loaded.` });

  // Pending reminders are rows, so a restart picks them up where it left off.
  startReminderEngine(client);
  logger.info({ message: 'Reminder engine started.' });

  // Days that open their nominations on a timer are rows too.
  startNominationEngine(client);
  logger.info({ message: 'Nomination engine started.' });

  // Exports with work left are rows too; an archive interrupted by a restart carries on.
  startOffsiteEngine(client);
  logger.info({ message: 'Offsite engine started.' });

  // In the background: a running game's roles get whatever channel grants were added since it began.
  void restoreChannelOverwrites(client).catch((error: unknown) =>
    logger.warn({ message: 'Could not restore the channel overwrites of running games.', error }),
  );
}
