import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { isOpen } from '../../games/nominations/open';
import { accuserChoices, entryContext, nomineeChoices } from '../../views/nominations/choices';
import { nominateModal, proxyNominateModal } from '../../views/nominations/modals';
import { dayCardOf, nominationContext } from './context';
import { S } from '../../../../strings';

/** `/nominations nominate`: the day card's Nominate, from the command line - the same modal, through the card. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Nominate a player (or the Storyteller) for execution today.')
  .define(async (interaction) => {
    const ctx = await nominationContext(interaction, { defer: false });
    if (!ctx) return;
    if (!isOpen(ctx.phase)) {
      await toast.ephemeral(interaction, S.errors.nominationsClosed, { accent: accent.warning });
      return;
    }

    if (ctx.me && ctx.me.seat.state !== 'alive') {
      await toast.ephemeral(interaction, S.errors.nominationRefused['notAlive']!, { accent: accent.warning });
      return;
    }
    const card = await dayCardOf(ctx.phase.id);
    if (!card) {
      await toast.ephemeral(interaction, S.errors.nominationsClosed, { accent: accent.warning });
      return;
    }

    const target = await nomineeChoices(interaction.client, ctx.game, ctx.phase.id, ctx.rows);
    if (target.length === 0) {
      await toast.ephemeral(interaction, S.errors.nobodyToNominate, { accent: accent.warning });
      return;
    }
    if (ctx.me) {
      await nominateModal.show(interaction, entryContext(card), { options: { target } });
      return;
    }
    // An unseated Storyteller nominates on a player's behalf.
    const accuser = await accuserChoices(interaction.client, ctx.game, ctx.rows);
    if (accuser.length === 0) {
      await toast.ephemeral(interaction, S.errors.nobodyToNominateFor, { accent: accent.warning });
      return;
    }
    await proxyNominateModal.show(interaction, entryContext(card), { options: { accuser, target } });
  });
