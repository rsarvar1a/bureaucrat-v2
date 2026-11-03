import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { openToday } from '../../games/nominations/today';
import { entryContext, openNominationChoices } from '../../views/nominations/choices';
import { dayVote } from '../../views/nominations/modals';
import { dayCardOf, nominationContext } from './context';
import { S } from '../../../../strings';

/** `/nominations vote`: the day card's Vote, from the command line - pick the nomination, then vote. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("Vote on one of today's open nominations.")
  .define(async (interaction) => {
    const ctx = await nominationContext(interaction, { defer: false });
    if (!ctx) return;
    if (!ctx.me) {
      await toast.ephemeral(interaction, S.errors.nominationRefused['notSeated']!, { accent: accent.warning });
      return;
    }

    const card = await dayCardOf(ctx.phase.id);
    if (!card) {
      await toast.ephemeral(interaction, S.errors.nominationsClosed, { accent: accent.warning });
      return;
    }
    const open = await openToday(ctx.phase.id);
    if (open.length === 0) {
      await toast.ephemeral(interaction, S.errors.nothingOpenToVote, { accent: accent.warning });
      return;
    }

    const nomination = await openNominationChoices(interaction.client, ctx.game, ctx.rows, open);
    await dayVote.show(interaction, entryContext(card), { options: { nomination } });
  });
