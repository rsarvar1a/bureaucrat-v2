import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf } from '../../access';
import { seatingDetails } from '../../views/games/seating/details';
import { S } from '../../../../strings';

// Open to anyone in the game's channel or threads: the same reply the town
// square's Details button gives, so a player can pull it up from anywhere.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('See the seating, and your own role when the Storytellers expose them.')
  .define(async (interaction) => {
    const actor = actorOf(interaction);
    if (actor === null || !interaction.channelId) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const game = await getGameByChannel(BigInt(interaction.channelId));
    if (!game || game.guild !== BigInt(interaction.guildId!)) {
      await toast.ephemeral(interaction, S.errors.noGameHere, { accent: accent.warning });
      return;
    }

    const payload = await seatingDetails(interaction.client, game, interaction.channelId, BigInt(interaction.user.id));
    await interaction.editReply({ ...payload, flags: [MessageFlags.IsComponentsV2] });
  });
