import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { insertReminder } from '../../../../drizzle/reminders';
import { spawnByRoute } from '../../games/create';
import { parseDuration, parseOffsets } from '../../games/duration';
import { headsUpText } from '../../games/reminders/schedule';
import { ROLE_LABEL } from '../../games/roles';
import { reminderContext } from './context';
import { S } from '../../../../strings';

/**
 * A reminder in this game's channel. With a message and a duration it is set
 * on the spot, pinging the Players; with either missing it opens a pane
 * (`greminder`) where the pieces are prepared one by one, whatever was given
 * already filled in.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Set a reminder in this channel, now or from a form.')
  .withOption(new Option('message', SlashCommandStringOption).describe('What to say when it fires'))
  .withOption(new Option('duration', SlashCommandStringOption).describe('How long from now, like 1d13h4m2s'))
  .withOption(
    new Option('offsets', SlashCommandStringOption).describe('Heads-ups before it fires, like 4h 2h 1h (optional)'),
  )
  .define(async (interaction, params) => {
    const game = await reminderContext(interaction);
    if (!game) return;

    const message = params['message']?.trim() || null;
    const duration = params['duration'] ? parseDuration(params['duration']) : null;
    if (params['duration'] && duration === null) {
      await toast.ephemeral(interaction, S.errors.badDuration, { accent: accent.warning });
      return;
    }

    const offsets = params['offsets'] ? parseOffsets(params['offsets'], duration) : [];
    if (offsets === null) {
      await toast.ephemeral(interaction, S.errors.badOffsets, { accent: accent.warning });
      return;
    }

    if (message && duration) {
      const fireAt = new Date(Date.now() + duration * 1000);
      await insertReminder({
        game: game.id,
        author: BigInt(interaction.user.id),
        channel: BigInt(interaction.channelId),
        message,
        fireAt,
        offsets,
        mentions: ['Player'],
      });
      await toast.ephemeral(
        interaction,
        `Reminder set for <t:${Math.floor(fireAt.getTime() / 1000)}:R>, pinging ${ROLE_LABEL.Player}. Heads-ups: ${headsUpText(offsets)}.`,
        { accent: accent.success, timeoutMs: 15_000 },
      );
      return;
    }

    await spawnByRoute(
      'greminder',
      { interaction },
      {
        entityId: game.id,
        ids: { gconfig: game.id },
        visibility: 'ephemeral',
        state: { message: message ?? '', duration, offsets, mentions: ['Player'], channel: interaction.channelId },
      },
    );
  });
