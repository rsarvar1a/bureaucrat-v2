import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { createReveal } from '../../games/reveal';
import { revealContext } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Open the private reveal and reactions threads for this game.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('What the write-up is called'))
  .define(async (interaction, params) => {
    const ctx = await revealContext(interaction, { storyteller: true });
    if (!ctx) return;

    const name = params['name'].trim().slice(0, 80);
    const result = await createReveal(interaction.client, ctx.game, name);
    if (!result.ok) {
      await toast.ephemeral(
        interaction,
        result.reason === 'exists' ? S.errors.revealExists : S.errors.revealNotCreated,
        { accent: accent.warning },
      );
      return;
    }
    await toast.ephemeral(
      interaction,
      S.reveal.created(result.threads.reveal.thread, result.threads.reactions.thread),
      { accent: accent.success, timeoutMs: 15_000 },
    );
  });
