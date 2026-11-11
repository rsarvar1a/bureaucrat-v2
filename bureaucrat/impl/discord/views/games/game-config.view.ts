import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { stack } from '../../../../engine/discord/components/stack';
import { confirmButton, type ConfirmState } from '../../../../engine/discord/components/confirm';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { currentPhase } from '../../../../drizzle/game-phases';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { listSeating, listUnseatedPlayers } from '../../../../drizzle/seating';
import { listSignups } from '../../../../drizzle/signups';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { label } from '../../games/phases';
import { startGame } from '../../games/start';
import { placeScriptCard } from '../../games/script-card';
import { placeTownSquare } from '../../games/town-square';
import { GameEvents } from './events';
import { checklist, renderChecklist } from './checklist';
import { CONFIG_TABS, type ConfigTab } from './tabs';
import { S } from '../../../../strings';

type HeaderState = { tab: ConfigTab } & ConfirmState<'start'>;

const strip = stack<HeaderState>()({ route: 'gconfig', field: 'tab', tabs: CONFIG_TABS, fallback: 'setup' });

const start = confirmButton<HeaderState>()({
  action: 'start',
  label: 'Start game',
  style: ButtonStyle.Success,
  onConfirm: async (ctx, interaction) => {
    const game = await getGame(ctx.view.entityId!);
    const result = game ? await startGame(interaction.client, game) : null;

    // The confirm leaves its flag set and returns nothing; clear it and
    // repaint everything, this header included.
    await ctx.updateState({ 'confirming:start': false });
    await ctx.notifyAll(GameEvents.Changed);

    if (!result) return;
    if (!result.ok) {
      await toast.followUp(
        interaction,
        result.reason === 'nothing-seated' ? S.errors.nothingSeated : S.errors.alreadyStarted,
        {
          accent: accent.warning,
        },
      );
      return;
    }

    // The planned threads exist now, so the script card and the players' town
    // square can go where they are bound: script first, so a shared thread
    // reads script then seating.
    const started = await getGame(game!.id);
    if (started) {
      await placeScriptCard(interaction.client, started);
      await placeTownSquare(interaction.client, started);
    }

    const { publicThreads, playerThreads, failed } = result.report;
    await toast.followUp(
      interaction,
      `Started: ${publicThreads} public thread(s) and ${playerThreads} player thread(s) opened` +
        (failed.length > 0 ? `; could not open ${failed.join(', ')}.` : '.'),
      { accent: failed.length > 0 ? accent.warning : accent.success, timeoutMs: 15_000 },
    );
  },
});

// Window A: the navigation header at the top of GAME CONFIG. It shows only
// what every tab needs to see and leaves the rest to the window beneath it.
export default createView<HeaderState, typeof GameEvents>()({
  id: 'gconfig',
  idParams: [],
  events: GameEvents,
  defaultState: { tab: 'setup' },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const [phase, script, seating, unseated, pending] = await Promise.all([
      currentPhase(game.id),
      getScriptSummary(game.id),
      listSeating(game.id),
      listUnseatedPlayers(game.id),
      listSignups(game.id),
    ]);

    // Start until the game runs, then End in its place: the same pane `/game end` opens.
    const actionRow =
      game.state === 'running'
        ? buttonRow(button(view.customId('end'), 'End game', ButtonStyle.Danger))
        : start.isConfirming(view)
          ? start.confirmRow(view)
          : start
              .row(view)
              .setComponents(start.button(view).setDisabled(game.state !== 'signups' || seating.length === 0));

    // Before Start, what is left to do; after it, only where the game is. The
    // rest is implicit in the windows beneath.
    const line =
      game.state === 'signups'
        ? renderChecklist(checklist({ script, seating, unseated: unseated.length, pending: pending.length }))
        : game.state === 'completed'
          ? 'This game has ended.'
          : `It is **${phase ? label(phase) : 'Night 1'}**.`;

    return v2(
      linear(
        text(`### ${game.name}`),
        text(line),
        separator(),
        ...strip.rows(view),
        separator(),
        actionRow,
      ).setAccentColor(accent.brand),
    );
  },

  interactions: {
    ...strip.interactions,
    ...start.interactions,

    end: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const game = await getGame(ctx.view.entityId!);
      if (!game || game.state !== 'running') {
        await interaction.deferUpdate();
        return { action: 'render' };
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView('gend', { interaction }, { visibility: 'ephemeral', state: { winner: null, selected: [] } });
    },
  },
});
