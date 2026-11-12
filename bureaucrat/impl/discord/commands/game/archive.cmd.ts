import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { Permissions } from '../../../acl/permissions';
import { accessAllows, actorOf } from '../../access';
import { archiveGame } from '../../games/archive';
import { S } from '../../../../strings';

const REFUSALS = {
  'no-archive': S.errors.noArchive,
  'already-archived': S.errors.gameAlreadyArchived,
  'not-moved': S.errors.gameNotArchived,
} as const;

/**
 * Files the ended game this channel belongs to in its archive category.
 *
 * Open at the gate and decided here: the owner of the game, or anyone who
 * manages the server, once the game has ended.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Move this ended game into the archive.')
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

    if (game.state !== 'completed') {
      await toast.ephemeral(interaction, S.errors.gameNotEnded, { accent: accent.warning });
      return;
    }

    const owner = game.creator === actor.id;
    const manager = owner ? true : (await accessAllows(game.guild, actor, Permissions.Game.Archive)).ok;
    if (!owner && !manager) {
      await toast.ephemeral(interaction, S.errors.notGameArchiver, { accent: accent.warning });
      return;
    }

    const result = await archiveGame(interaction.client, game);
    if (!result.ok) {
      await toast.ephemeral(interaction, REFUSALS[result.reason], {
        accent: result.reason === 'already-archived' ? accent.neutral : accent.warning,
      });
      return;
    }

    await toast.ephemeral(interaction, `**${game.name}** is archived in <#${result.category}>.`, {
      accent: accent.success,
      timeoutMs: 10_000,
    });
  });
