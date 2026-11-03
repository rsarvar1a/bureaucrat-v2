import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
} from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { listSeating } from '../../../../drizzle/seating';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { endGame } from '../../games/end';
import type { Emote } from '../../games/emotes';
import { defaultWinners, winnersFrom } from '../../games/outcome';
import { ALIGNMENT_LABEL, teamLookup, type Alignment } from '../../games/script/alignment';
import { offerVacancy } from '../../games/vacancy';
import { displayNames } from '../queue/members';
import { roleEmote, roleLook } from './seating/render';
import { characterChoices } from './seating/roles';
import { GameEvents } from './events';
import { S } from '../../../../strings';

/** The team declared, and the seats picked as its winners. Nothing until the team is picked. */
type EndState = { winner: Alignment | null; selected: string[] };

const TEAMS: Alignment[] = ['good', 'evil'];

const asEmoji = (emote: Emote | null) =>
  emote ? { emoji: { id: emote.id, name: emote.name, animated: emote.animated } } : {};

const isAlignment = (value: string | undefined): value is Alignment => TEAMS.includes(value as Alignment);

/**
 * The pane behind `/game end`: the winning team in one select, the players on
 * it in another. Picking the team fills the players with everyone on that
 * side, by true role and alignment; the Storyteller's job is to review the
 * edge cases (a Traveler, a turned player) before pressing End.
 */
export default createView<EndState>()({
  id: 'gend',
  idParams: [],
  events: {},
  defaultState: { winner: null, selected: [] },
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const [game, rows, script] = await Promise.all([
      getGame(view.entityId!),
      listSeating(view.entityId!),
      getScriptSummary(view.entityId!),
    ]);
    if (!game) return v2(linear(text(S.errors.notHere)).setAccentColor(accent.warning));

    const look = roleLook(client, game.guild, characterChoices(script?.json));
    const seated = rows.filter((row) => row.member !== null);
    const names = await displayNames(
      client,
      game.guild,
      seated.map((row) => row.member),
    );
    const winner = view.state?.winner ?? null;
    const selected = view.state?.selected ?? [];

    return v2(
      linear(
        text(`### Ending ${game.name}`),
        text('Review the members of the winning team before ending the game.'),
        separator(),
        selectRow(
          select(view.customId('team'), 'Which team won?').addOptions(
            TEAMS.map((team) => ({
              label: `${ALIGNMENT_LABEL[team]} wins`,
              value: team,
              default: team === winner,
              ...asEmoji(look.emote(team)),
            })),
          ),
        ),
        selectRow(
          seated.length === 0
            ? // A select needs an option to build, so an empty game shows one it cannot pick.
              select(view.customId('pick'), S.games.noPlayersSeated)
                .setDisabled(true)
                .addOptions({ label: S.games.noPlayersSeated, value: 'none' })
            : select(view.customId('pick'), winner ? 'Which players won?' : 'Pick the winning alignment first')
                .setMinValues(0)
                .setMaxValues(seated.length)
                .setDisabled(winner === null)
                .addOptions(
                  seated.map((row) => ({
                    label: `${row.seat.seat}. ${names[String(row.member)] ?? row.member}`,
                    description: row.seat.trueRole ?? 'no role',
                    value: row.seat.id,
                    default: selected.includes(row.seat.id),
                    ...asEmoji(row.seat.trueRole ? roleEmote(row.seat.trueRole, look, row.seat.trueAlignment) : null),
                  })),
                ),
        ),
        buttonRow(
          button(view.customId('end'), `End game`, ButtonStyle.Danger).setDisabled(winner === null),
          button(view.customId('cancel'), 'Cancel', ButtonStyle.Secondary),
        ),
      ).setAccentColor(winner === 'good' ? accent.success : winner === 'evil' ? accent.danger : accent.neutral),
    );
  },

  interactions: {
    // The team fills the players; a pick after that is the Storyteller's review.
    team: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const winner = interaction.values[0];
      if (!isAlignment(winner)) return { action: 'render' };

      const [rows, script] = await Promise.all([listSeating(ctx.view.entityId!), getScriptSummary(ctx.view.entityId!)]);
      const teamOf = teamLookup(characterChoices(script?.json));
      await ctx.updateState({ winner, selected: defaultWinners(rows, winner, teamOf) });

      return { action: 'render' };
    },

    pick: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ selected: interaction.values });
      return { action: 'render' };
    },

    cancel: async (interaction) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      return { action: 'destroy' };
    },

    end: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const winner = ctx.view.state?.winner ?? null;
      if (!winner) return { action: 'render' };

      const game = await getGame(ctx.view.entityId!);
      if (!game) return { action: 'destroy' };
      if (game.state === 'completed') {
        await toast.followUp(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
        return { action: 'destroy' };
      }

      const [rows, script] = await Promise.all([listSeating(game.id), getScriptSummary(game.id)]);
      const winners = winnersFrom(rows, ctx.view.state?.selected ?? [], teamLookup(characterChoices(script?.json)));

      await endGame(interaction.client, game, { winner, winners });
      if (game.queue) await offerVacancy(ctx.spawnView, { interaction }, game.queue);

      await toast.followUp(
        interaction,
        `**${game.name}** has ended. ${ALIGNMENT_LABEL[winner]} wins, with ${winners.length} player(s) on the winning side.`,
        { accent: accent.success },
      );

      // `Ended` has already taken this pane down with the rest of the stack.
      return { action: 'noop' };
    },
  },
});
