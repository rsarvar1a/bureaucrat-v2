import { SlashCommandSubcommandBuilder, SlashCommandUserOption } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent, buttonRow, linear, linkButton, text, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getManagedThread } from '../../../../drizzle/managed-threads';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { proposeWhisper } from '../../games/whispers/post';
import { threadUrl } from '../../games/whispers/propose';
import { whisperContext } from './context';
import { S } from '../../../../strings';

// Stealthy by design: nothing is posted in town and nothing is spent. The
// only reply is this ephemeral, with the thread.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Whisper with a seated neighbour for free, when the Storytellers allow it.')
  .withOption(new Option('player', SlashCommandUserOption, true).describe('The neighbour to whisper with'))
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
      { game: found.game, initiator: found.me, invitees: [invitee], async: false, free: true },
    );
    if (!posted.ok) {
      await toast.ephemeral(interaction, S.errors.whisperRefused[posted.reason], { accent: accent.warning });
      return;
    }

    const thread = posted.whisper.thread ? await getManagedThread(posted.whisper.thread) : undefined;
    await interaction.editReply(
      v2(
        linear(
          text(thread ? `Your whisper is in <#${thread.thread}>.` : S.whispers.opened),
          ...(thread ? [buttonRow(linkButton('Open thread', threadUrl(found.game.guild, thread.thread)))] : []),
        ),
      ),
    );
  });
