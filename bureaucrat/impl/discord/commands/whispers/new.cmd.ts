import { SlashCommandBooleanOption, SlashCommandSubcommandBuilder, SlashCommandUserOption } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { proposeWhisper } from '../../games/whispers/post';
import { whisperContext } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Invite a player to a whisper.')
  .withOption(new Option('player', SlashCommandUserOption, true).describe('Who to whisper with'))
  .withOption(new Option('async', SlashCommandBooleanOption).describe('Take it from the asynchronous allowance'))
  .define(async (interaction, params) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const invitee = await getParticipantByMember(found.game.id, BigInt(params.player.id));
    if (!invitee) {
      await toast.ephemeral(interaction, S.errors.whisperRefused['invitee-not-player'], { accent: accent.warning });
      return;
    }

    const posted = await proposeWhisper(
      interaction.client,
      { interaction },
      { game: found.game, initiator: found.me, invitees: [invitee], async: params.async ?? false, free: false },
    );
    await toast.ephemeral(
      interaction,
      posted.ok && posted.kind === 'invited'
        ? S.whispers.invited(posted.channel)
        : posted.ok
          ? S.whispers.opened
          : S.errors.whisperRefused[posted.reason],
      {
        accent: posted.ok ? accent.success : accent.warning,
      },
    );
  });
