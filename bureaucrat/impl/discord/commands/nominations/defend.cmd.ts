import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { updateNomination } from '../../../../drizzle/nominations';
import { truncate } from '../../games/nominations/format';
import { publish } from '../../games/nominations/publish';
import { openAgainst, openToday } from '../../games/nominations/today';
import { entryContext } from '../../views/nominations/choices';
import { nominationChanged } from '../../views/nominations/events';
import { defenseModal } from '../../views/nominations/modals';
import { cardOf, nominationContext } from './context';
import { S } from '../../../../strings';

/** `/nominations defend`: the defense on the open nomination against the caller, given here or in the card's modal. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Set or change your defense against the nomination of you today.')
  .withOption(new Option('defense', SlashCommandStringOption).describe('Your defense; leave out for a form'))
  .define(async (interaction, params) => {
    const given = params['defense']?.trim();
    const ctx = await nominationContext(interaction, { defer: given !== undefined });
    if (!ctx) return;
    if (!ctx.me) {
      await toast.ephemeral(interaction, S.errors.nominationRefused['notSeated']!, { accent: accent.warning });
      return;
    }
    const me = ctx.me;

    const against = openAgainst(await openToday(ctx.phase.id), me.seat.id);
    if (!against) {
      await toast.ephemeral(interaction, S.errors.notNomineeToday, { accent: accent.warning });
      return;
    }

    if (given === undefined) {
      const card = await cardOf(against.nomination.id);
      if (!card) {
        await toast.ephemeral(interaction, S.errors.nominationGone, { accent: accent.warning });
        return;
      }
      await defenseModal.show(interaction, entryContext(card), {
        values: { defense: against.nomination.defense ?? '' },
      });
      return;
    }

    await updateNomination(against.nomination.id, { defense: truncate(given, 400) || null });
    await publish(interaction.client, [nominationChanged(against.nomination.id)]);
    await toast.ephemeral(interaction, S.common.defenseSet, { accent: accent.success });
  });
