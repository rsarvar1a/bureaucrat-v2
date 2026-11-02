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
import { getOrCreateGameSettings, updateGameSettings } from '../../../../drizzle/game-settings';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { placeTownSquare } from '../../games/town-square';
import { GameEvents } from './events';
import { S } from '../../../../strings';

type SeatingConfigState = Record<string, never>;

/** The select's value for no public square; a planned thread is `t:<name>`. */
const NOWHERE = 'none';

// Window C. Where the players' town square lives and how much it tells them.
// The thread is kept by its planned name, as nominations do, and the square
// is placed once Start has made the thread.
export default createView<SeatingConfigState>()({
  id: 'gseatingconfig',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const settings = await getOrCreateGameSettings(view.entityId!);

    // A thread dropped from the plan since it was picked means no square.
    const bound =
      settings.seatingThread && settings.plannedThreads.includes(settings.seatingThread)
        ? settings.seatingThread
        : null;

    return v2(
      linear(
        text('### Seating'),
        text(
          [
            settings.rolesLive
              ? 'Role and alignment changes reach the players immediately.'
              : 'Role and alignment changes wait for a publish.',
            '',
            settings.exposeRoles
              ? 'Players can click Details to see their own (apparent) role.'
              : 'Players are not shown any non-Traveler roles.',
          ].join('\n'),
        ),
        separator(),
        selectRow(
          select(view.customId('thread'), 'Where the town square is shown').addOptions(
            { label: 'Nowhere', value: NOWHERE, default: bound === null },
            ...settings.plannedThreads.slice(0, 24).map((name) => ({
              label: name,
              description: 'planned public thread',
              value: `t:${name}`,
              default: name === bound,
            })),
          ),
        ),
        buttonRow(
          button(
            view.customId('expose'),
            `Expose roles · ${settings.exposeRoles ? 'on' : 'off'}`,
            settings.exposeRoles ? ButtonStyle.Success : ButtonStyle.Secondary,
          ),
          button(
            view.customId('live'),
            `Roles · ${settings.rolesLive ? 'live' : 'on publish'}`,
            settings.rolesLive ? ButtonStyle.Success : ButtonStyle.Secondary,
          ),
        ),
      ),
    );
  },

  interactions: {
    thread: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const picked = interaction.values[0] ?? NOWHERE;
      await updateGameSettings(ctx.view.entityId!, {
        seatingThread: picked.startsWith('t:') ? picked.slice(2) : null,
      });

      // Mid-game the square moves at once; before Start there is nothing to move yet.
      const game = await getGame(ctx.view.entityId!);
      if (game && game.state === 'running') {
        const placed = await placeTownSquare(interaction.client, game);
        if (placed === 'no-thread') {
          await toast.followUp(interaction, S.errors.noSuchThread, { accent: accent.warning });
        }
      }

      await ctx.notify(GameEvents.Changed);
      return { action: 'render' };
    },

    live: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      await updateGameSettings(ctx.view.entityId!, { rolesLive: !settings.rolesLive });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },

    expose: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      await updateGameSettings(ctx.view.entityId!, { exposeRoles: !settings.exposeRoles });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },
  },
});
