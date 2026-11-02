import { ChannelType, type Channel } from 'discord.js';
import { logger } from '../../../utilities/logger';

/**
 * Make a channel one the bot can actually write to, if it is a thread.
 *
 * Two things a thread needs that a channel never does, and both are silent
 * failures without this.
 *
 * **It may have archived.** Discord archives a thread after a period of idling
 * - the default is a day - and an archived thread refuses message edits. That
 * matters far more here than it looks: `events/render.ts` catches *any* edit
 * failure and destroys the view row, so a team coming back to a console the
 * morning after would find the view gone and its message stranded on screen,
 * with nothing to press. A session outlives a quiet thread easily.
 *
 * **The bot may not be in it.** A private thread is readable only to its
 * members, so a view can post once through the interaction and then be unable
 * to edit itself afterwards. Joining on demand - here, at the moment of
 * writing - covers it without putting the bot into every thread anybody makes.
 *
 * Only private ones, and only when the cache does not already say the bot is a
 * member. Posting to a public thread adds the bot by itself, so joining one
 * would be an API call per render for nothing, and renders are frequent: every
 * notify redraws every subscriber.
 *
 * Best-effort on purpose. A caller that cannot wake a thread should still try
 * its write and let the existing error path deal with the outcome: the one
 * case that survives this is a thread both archived *and* locked, which needs
 * `ManageThreads` to reopen, and which a moderator shut deliberately.
 */
export const writable = async (channel: Channel | null | undefined): Promise<void> => {
  if (!channel || !channel.isThread()) return;

  try {
    if (channel.archived) await channel.setArchived(false);

    if (channel.type === ChannelType.PrivateThread && !channel.members.cache.has(channel.client.user.id)) {
      await channel.join();
    }
  } catch (error) {
    logger.debug({ message: `Could not make thread ${channel.id} writable.`, error });
  }
};
