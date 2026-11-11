import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { accent, text, separator, linear, select, selectRow, v2 } from '../../../../engine/discord/elements';
import { getPhase } from '../../../../drizzle/game-phases';
import { getGame } from '../../../../drizzle/games';
import { listNominationsOfPhase } from '../../../../drizzle/nominations';
import { listSeating } from '../../../../drizzle/seating';
import { listVotes } from '../../../../drizzle/votes';
import { inGuild } from '../../guards';
import { storytellsDay } from '../../guards/nominations';
import { placeOnBlock } from '../../games/nominations/block';
import { label } from '../../games/phases';
import { statusOf, tally } from '../../games/nominations/rules';
import { GameEvents } from '../games/events';
import { who } from '../games/seating/render';
import { namer } from '../naming';
import { blockChoices } from './choices';
import { NominationEvents } from './events';
import type { Empty } from './modals';
import { S } from '../../../../strings';

const dismiss = dismissButton<Empty>()({ action: 'dismiss' });

/**
 * The Storyteller's pane for the day, ephemeral beside the day card: who is
 * on the block, and a select to put any of today's nominations there, or
 * nobody. The count places the block itself as nominations settle; this is
 * for what the count cannot see.
 */
export default createView<Empty>()({
  id: 'gnomblock',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [NominationEvents.DayChanged], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytellsDay] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const phase = await getPhase(view.entityId!);
    const game = phase ? await getGame(phase.game) : undefined;
    if (!phase || !game) {
      return v2(linear(text(S.errors.nominationGone), separator(), dismiss.row(view)).setAccentColor(accent.neutral));
    }

    const [nominations, rows] = await Promise.all([listNominationsOfPhase(phase.id), listSeating(game.id)]);
    const name = await namer(
      client,
      game.guild,
      view.channel,
      rows.map((r) => r.member),
    );
    const bySeat = new Map(rows.map((row) => [row.seat.id, row]));

    const entries = await Promise.all(
      nominations.map(async (nomination) => {
        const ballot = (await listVotes(nomination.id)).map((v) => v.vote);
        return {
          nomination,
          status: statusOf(ballot, nomination.required, nomination.finalizedAt !== null),
          tally: tally(ballot),
        };
      }),
    );
    const onBlock = nominations.find((n) => n.block);
    const condemned = onBlock
      ? onBlock.kind === 'storyteller'
        ? 'The Storyteller'
        : onBlock.defendant && bySeat.has(onBlock.defendant)
          ? who(bySeat.get(onBlock.defendant)!, name)
          : '*An empty seat*'
      : null;

    return {
      ...v2(
        linear(
          text(`### Storyteller · ${label(phase)}`),
          text(
            condemned
              ? `${condemned} is on the block.`
              : nominations.length > 0
                ? '**Nobody is on the block.**'
                : '*Nobody has been nominated yet.*',
          ),
          separator(),
          ...(nominations.length > 0
            ? [
                selectRow(
                  select(view.customId('block'), "Who's on the block?")
                    .setMinValues(0)
                    .setMaxValues(1)
                    .addOptions(await blockChoices(client, game, rows, entries)),
                ),
              ]
            : []),
          dismiss.row(view),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,

    // An empty pick clears the block; the select allows none.
    block: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await placeOnBlock(interaction.client, ctx.view.entityId!, interaction.values[0] ?? null);
      return { action: 'render' };
    },
  },
});
