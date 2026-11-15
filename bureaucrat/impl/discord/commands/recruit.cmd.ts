import { MessageFlags, SlashCommandBuilder, SlashCommandStringOption } from 'discord.js';
import { Option, Superbuilder } from '../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../engine/discord/elements';
import { toast } from '../../../engine/discord/reply';
import { getGameByChannel } from '../../../drizzle/games';
import { actorOf } from '../access';
import { isStorytellerOf } from '../guards/game';
import { recruit, recruitReply } from '../games/recruitment/recruit';
import { S } from '../../../strings';

const NOTE_LIMIT = 1500;

/**
 * Pings the recruitment roles in this game's channel. Open at the gate and
 * decided here, like `/game rename`: a Storyteller of the game, from its
 * channel or any of its threads.
 */
export default new Superbuilder(new SlashCommandBuilder())
  .describe("Periodically ping the server's recruitment roles for your game.")
  .withOption(new Option('note', SlashCommandStringOption).describe('Your message'))
  .define(async (interaction, params) => {
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

    if (!(await isStorytellerOf(game, actor))) {
      await toast.ephemeral(interaction, S.errors.notGameStoryteller, { accent: accent.warning });
      return;
    }

    const note = params['note']?.trim().slice(0, NOTE_LIMIT) || null;
    const reply = recruitReply(await recruit(interaction.client, game, actor.id, note), game.channel);
    await toast.ephemeral(interaction, reply.message, {
      accent: reply.ok ? accent.success : accent.warning,
      timeoutMs: 15_000,
    });
  });
