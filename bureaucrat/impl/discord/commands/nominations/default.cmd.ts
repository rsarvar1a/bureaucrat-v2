import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { setVoteText } from '../../../../drizzle/votes';
import { publish } from '../../games/nominations/publish';
import { mayVote } from '../../games/nominations/rules';
import { nominationChanged } from '../../views/nominations/events';
import { openToday } from '../../games/nominations/today';
import { nominationContext } from './context';
import { S } from '../../../../strings';

/** What a silent hand says when the caller defaults it. */
export const DEFAULT_VOTE = 'no';

/**
 * `/nominations default`: a "no" on every open nomination today the caller
 * has not voted on yet, leaving anything already written alone.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Vote "no" on every open nomination you have not voted on yet.')
  .define(async (interaction) => {
    const ctx = await nominationContext(interaction);
    if (!ctx) return;
    if (!ctx.me) {
      await toast.ephemeral(interaction, S.errors.nominationRefused['notSeated']!, { accent: accent.warning });
      return;
    }
    const me = ctx.me;

    const changed: string[] = [];
    for (const { nomination, ballot } of await openToday(ctx.phase.id)) {
      const mine = ballot.find((v) => v.seat.id === me.seat.id);
      if (!mine || mine.vote.locked || mine.vote.public || !mayVote(nomination.kind, mine.seat.state)) continue;
      if (await setVoteText(mine.vote.id, { public: DEFAULT_VOTE })) changed.push(nominationChanged(nomination.id));
    }

    await publish(interaction.client, changed);
    await toast.ephemeral(interaction, S.common.defaulted(changed.length), {
      accent: changed.length > 0 ? accent.success : accent.neutral,
    });
  });
