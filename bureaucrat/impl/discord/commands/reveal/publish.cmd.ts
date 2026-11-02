import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { publishReveal } from '../../games/reveal';
import { revealContext } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Lock the write-up and bring the Players and Kibitzers into the reveal and the reactions.')
  .define(async (interaction) => {
    const ctx = await revealContext(interaction, { storyteller: true });
    if (!ctx) return;

    const published = await publishReveal(interaction.client, ctx.game);
    await toast.ephemeral(interaction, published ? S.reveal.published : S.errors.noReveal, {
      accent: published ? accent.success : accent.warning,
    });
  });
