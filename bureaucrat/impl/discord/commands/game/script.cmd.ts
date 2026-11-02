import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { actorOf } from '../../access';
import { spawnByRoute } from '../../games/create';
import { S } from '../../../../strings';

// Open to anyone who can see the game's channel: a script is public reading.
// The card is an ephemeral view so it can carry a Preview button; the files
// come back from the row each time, since the Discord URLs they arrived on
// have long expired.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Get this game's script.")
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

    const script = await getScriptSummary(game.id);
    if (!script || (!script.link && !script.json && !script.hasPdf)) {
      await toast.ephemeral(interaction, S.errors.noScript, { accent: accent.neutral });
      return;
    }

    await spawnByRoute(
      'gscriptcard',
      { interaction },
      { entityId: game.id, ids: { gconfig: game.id }, visibility: 'ephemeral' },
    );
  });
