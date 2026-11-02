import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { actorOf } from '../../access';
import { spawnByRoute } from '../../games/create';
import { reopenConfig } from '../../games/reopen';
import { S } from '../../../../strings';

/**
 * Rebuilds the config stack of the game this channel belongs to, for when the
 * old one is lost or outdated. The game's owner only: a rebuild deletes what
 * is there, which is more than running the game asks for.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Open this game's persistent view.")
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

    if (game.state === 'completed') {
      await toast.ephemeral(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
      return;
    }

    if (game.creator !== actor.id) {
      await toast.ephemeral(interaction, S.errors.notGameOwner, { accent: accent.warning });
      return;
    }

    const result = await reopenConfig(interaction.client, spawnByRoute, { interaction }, game);
    if (!result.ok) {
      await toast.ephemeral(interaction, S.errors.noConfigThread, { accent: accent.danger });
      return;
    }

    await toast.ephemeral(interaction, `The config menu is rebuilt in <#${result.thread}>.`, {
      accent: accent.success,
      timeoutMs: 10_000,
    });
  });
