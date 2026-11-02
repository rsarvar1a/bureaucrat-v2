import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { admitToReveal, revealThreads } from '../../games/reveal';
import { revealContext } from './context';
import { S } from '../../../../strings';

// Open to anyone who can see the channel: an ended game's channel is the archive.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Read the reveal of this game: you are added to its thread.')
  .define(async (interaction) => {
    const ctx = await revealContext(interaction, { storyteller: false });
    if (!ctx) return;

    const outcome = await admitToReveal(interaction.client, ctx.game, 'reveal', ctx.actor.id);
    if (outcome !== 'admitted') {
      await toast.ephemeral(interaction, outcome === 'noReveal' ? S.errors.noReveal : S.errors.notAdmitted, {
        accent: accent.warning,
      });
      return;
    }
    const threads = await revealThreads(ctx.game.id);
    await toast.ephemeral(interaction, S.reveal.admitted(threads!.reveal.thread), { accent: accent.success });
  });
