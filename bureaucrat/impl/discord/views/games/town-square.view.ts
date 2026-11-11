import { AttachmentBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { getGame } from '../../../../drizzle/games';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { listSeating } from '../../../../drizzle/seating';
import { inGuild } from '../../guards';
import { namer } from '../naming';
import { GameEvents } from './events';
import { seatingDetails } from './seating/details';
import { roleLook, townSquare } from './seating/render';
import { publishedSquare } from '../../games/published';
import { liveGameState } from '../../games/clocktower-live';
import { channelName } from '../../games/names';
import { displayNames } from '../queue/members';
import { publishedLine } from './seating/published-line';
import { characterChoices } from './seating/roles';
import { getScriptSummary } from '../../../../drizzle/scripts';
import { S } from '../../../../strings';

type TownSquareState = Record<string, never>;

/**
 * The players' town square: a public message in the thread Configuration >
 * Seating binds it to. It shows the seating as last **published**, so a death
 * marked during the night stays with the Storytellers until they say; with
 * roles live, role changes alone come through at once. States and travelers'
 * roles are public; every other role stays with the Storytellers, unless they
 * expose roles, when Details tells each player their own. Details shows a
 * Storyteller or Kibitzer the whole chart as it stands.
 *
 * It listens to Changed as well as Published for the roles-live case, and
 * repaints the same square otherwise.
 */
export default createView<TownSquareState>()({
  id: 'gtownsquare',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed, GameEvents.Published], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const [live, settings, script] = await Promise.all([
      listSeating(game.id),
      getOrCreateGameSettings(game.id),
      getScriptSummary(game.id),
    ]);
    const rows = publishedSquare(settings.publishedSeating, live, settings.rolesLive);
    const name = await namer(
      client,
      game.guild,
      view.channel,
      (rows ?? []).map((r) => r.member),
    );
    const look = roleLook(client, game.guild, characterChoices(script?.json));

    return {
      ...v2(
        linear(
          text(`### ${game.name}`),
          text(rows ? townSquare(rows, look, name, (row) => row.seat.traveler) : S.errors.seatingUnpublished),
          text(publishedLine(settings.publishedAt)),
          separator(),
          buttonRow(
            button(view.customId('details'), 'Details', ButtonStyle.Secondary),
            button(view.customId('live'), 'Download for clocktower.live', ButtonStyle.Secondary).setDisabled(!rows),
          ),
        ),
      ),
      // The square repaints on every change: mentions name, never ping.
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    details: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const game = await getGame(ctx.view.entityId!);
      if (!game) return;

      const payload = await seatingDetails(
        interaction.client,
        game,
        interaction.channelId,
        BigInt(interaction.user.id),
      );
      await interaction.reply({ ...payload, flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    },

    // The published square as a clocktower.live game state: seats, life
    // states and travelers' roles, nothing of the grimoire. Anyone may take it.
    live: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const game = await getGame(ctx.view.entityId!);
      if (!game) {
        await interaction.editReply(S.errors.notHere);
        return;
      }

      const [live, settings, script] = await Promise.all([
        listSeating(game.id),
        getOrCreateGameSettings(game.id),
        getScriptSummary(game.id),
      ]);
      const rows = publishedSquare(settings.publishedSeating, live, settings.rolesLive);
      if (!rows) {
        await interaction.editReply(S.errors.seatingUnpublished);
        return;
      }

      const names = await displayNames(
        interaction.client,
        game.guild,
        rows.map((r) => r.member),
      );
      const state = liveGameState(
        rows,
        (row) =>
          row.seat.nickname ??
          (row.member === null ? `Seat ${row.seat.seat}` : (names[String(row.member)] ?? `Seat ${row.seat.seat}`)),
        script?.json ?? null,
        characterChoices(script?.json),
      );

      await interaction.editReply({
        content: 'Paste this into clocktower.live!',
        files: [
          new AttachmentBuilder(Buffer.from(JSON.stringify(state, null, 2)), {
            name: `${channelName(game.name)}-clocktower-live.json`,
          }),
        ],
      });
    },
  },
});
