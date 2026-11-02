import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { renameReveal } from '../../games/reveal';
import { revealContext } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Rename the reveal and its reactions thread.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('What the write-up is called now'))
  .define(async (interaction, params) => {
    const ctx = await revealContext(interaction, { storyteller: true });
    if (!ctx) return;

    const name = params['name'].trim().slice(0, 80);
    const renamed = await renameReveal(interaction.client, ctx.game, name);
    await toast.ephemeral(interaction, renamed ? S.reveal.renamed(name) : S.errors.noReveal, {
      accent: renamed ? accent.success : accent.warning,
    });
  });
