import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { updateNomination } from '../../../../drizzle/nominations';
import { truncate } from '../../games/nominations/format';
import { publish } from '../../games/nominations/publish';
import { openToday } from '../../games/nominations/today';
import { entryContext } from '../../views/nominations/choices';
import { nominationChanged } from '../../views/nominations/events';
import { accusationModal } from '../../views/nominations/modals';
import { cardOf, nominationContext } from './context';
import { S } from '../../../../strings';

/**
 * `/nominations accuse`: the accusation on the caller's open nomination,
 * given here or in the card's own modal, until the first hand is locked.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Set or change the accusation on your nomination today.')
  .withOption(new Option('accusation', SlashCommandStringOption).describe('Your accusation; leave out for a form'))
  .define(async (interaction, params) => {
    const given = params['accusation']?.trim();
    const ctx = await nominationContext(interaction, { defer: given !== undefined });
    if (!ctx) return;
    if (!ctx.me) {
      await toast.ephemeral(interaction, S.errors.nominationRefused['notSeated']!, { accent: accent.warning });
      return;
    }
    const me = ctx.me;

    const mine = [...(await openToday(ctx.phase.id))]
      .reverse()
      .find(({ nomination }) => nomination.plaintiff === me.seat.id);
    if (!mine) {
      await toast.ephemeral(interaction, S.errors.notNominatedToday, { accent: accent.warning });
      return;
    }
    if (mine.ballot.some((v) => v.vote.locked)) {
      await toast.ephemeral(interaction, S.errors.accusationLocked, { accent: accent.warning });
      return;
    }

    if (given === undefined) {
      const card = await cardOf(mine.nomination.id);
      if (!card) {
        await toast.ephemeral(interaction, S.errors.nominationGone, { accent: accent.warning });
        return;
      }
      await accusationModal.show(interaction, entryContext(card), {
        values: { accusation: mine.nomination.accusation ?? '' },
      });
      return;
    }

    await updateNomination(mine.nomination.id, { accusation: truncate(given, 400) || null });
    await publish(interaction.client, [nominationChanged(mine.nomination.id)]);
    await toast.ephemeral(interaction, S.common.accusationSet, { accent: accent.success });
  });
