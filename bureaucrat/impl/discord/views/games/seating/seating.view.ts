import { ButtonStyle, MessageFlags, time, TimestampStyles } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../../engine/discord/components/modal';
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
} from '../../../../../engine/discord/elements';
import type {
  HandlerResult,
  InteractionHandler,
  ViewContext,
  ViewInteraction,
} from '../../../../../engine/discord/views/types';
import { toast } from '../../../../../engine/discord/reply';
import { fetchUpload } from '../../../../../engine/discord/uploads';
import { getGame } from '../../../../../drizzle/games';
import { getOrCreateGameSettings } from '../../../../../drizzle/game-settings';
import { listParticipants } from '../../../../../drizzle/participants';
import { listSeating, listUnseatedPlayers, type SeatedPlayer } from '../../../../../drizzle/seating';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { matchLiveSeats, parseLiveGameState, rememberedMatch } from '../../../games/clocktower-live';
import { applyLiveState } from '../../../games/live-seating';
import { moveSeat, swapSeats, type LifeState } from '../../../games/seating';
import { addEmptySeat, associate, reorder, seatPlayers, seatUnseated, setSeat, unseat } from '../../../games/seats';
import { ensureStThreads, ensureStThreadsIfRunning } from '../../../games/st-threads';
import { isPublished } from '../../../games/published';
import { isJsonUpload } from '../../../games/script/parse';
import { JSON_LIMIT, refusal } from '../../../games/script/upload';
import { publishSeating } from '../../../games/town-square';
import { displayNames } from '../../queue/members';
import { namer } from '../../naming';
import { GameEvents } from '../events';
import { roleLook, seatLabel, townSquare } from './render';
import { characterChoices } from './roles';
import { getScriptSummary } from '../../../../../drizzle/scripts';
import { S } from '../../../../../strings';

type Mode = null | 'add' | 'move' | 'swap' | 'associate';

type SeatingState = { seat: string | null; mode: Mode };

const STATES: { value: LifeState; label: string; emote: string }[] = [
  { value: 'alive', label: 'Alive', emote: 'alive' },
  { value: 'dead', label: 'Dead', emote: 'dead' },
  { value: 'spent', label: 'No vote', emote: 'novote' },
];

const picked = (rows: SeatedPlayer[], view: { state: SeatingState | null }): SeatedPlayer | null =>
  rows.find((row) => row.seat.id === view.state?.seat) ?? null;

const nicknameForm = modal<SeatingState>()({
  action: 'nick-form',
  title: 'Nickname',
  fields: { nickname: field.short('Nickname', { required: false, maxLength: 60 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const seat = ctx.view.state?.seat;
    if (!seat) return { action: 'render' };

    await setSeat(seat, { nickname: values['nickname']?.trim() || null });
    await ctx.notify(GameEvents.Changed);

    return { action: 'render' };
  },
});

// A clocktower.live game state, attached as a file or pasted as text (the
// site copies it to the clipboard and never saves it): its seats are read
// here and, when they are the seats matched last time, applied at once;
// otherwise matched to players by name where the names agree and handed to
// the matching pane to finish. Discord caps a text box at 4000 characters, so a
// state too long to paste goes by file.
const liveForm = modal<SeatingState>()({
  action: 'live',
  title: 'Upload a clocktower.live game state',
  fields: {
    file: field.file('Game state file', {
      required: false,
      accept: ['application/json'],
      maxFiles: 1,
      description: 'A .json file of the game state, if you saved one…',
    }),
    paste: field.paragraph('…or the game state pasted', {
      required: false,
      maxLength: 4000,
      placeholder: '{"bluffs":[…],"edition":{…},"players":[…]}',
    }),
  },
  async onSubmit(values, interaction, ctx) {
    const upload = values['file'][0];
    const pasted = values['paste'].trim();
    if (!upload && !pasted) {
      await toast.ephemeral(interaction, S.errors.liveNothingGiven, { accent: accent.warning });
      return;
    }
    if (upload && !isJsonUpload(upload)) {
      await toast.ephemeral(interaction, S.errors.uploadWrongType('JSON file'), { accent: accent.warning });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let source = pasted;
    if (upload) {
      const fetched = await fetchUpload(upload, { maxBytes: JSON_LIMIT });
      if (!fetched.ok) {
        await toast.ephemeral(interaction, refusal(fetched, 'JSON file', '1 MB'), { accent: accent.warning });
        return;
      }
      source = fetched.bytes.toString('utf8');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(source);
    } catch {
      await toast.ephemeral(interaction, S.errors.liveInvalid('not valid JSON.'), { accent: accent.warning });
      return;
    }

    const parsed = parseLiveGameState(raw);
    if (!parsed.ok) {
      await toast.ephemeral(interaction, S.errors.liveInvalid(parsed.reason), { accent: accent.warning });
      return;
    }

    const game = await getGame(ctx.view.entityId!);
    if (!game) {
      await toast.ephemeral(interaction, S.errors.notHere, { accent: accent.warning });
      return;
    }
    const [players, rows, settings] = await Promise.all([
      listParticipants(game.id, 'Player'),
      listSeating(game.id),
      getOrCreateGameSettings(game.id),
    ]);

    // The same seats as last time, however they sit: the last matching applies as it is.
    const kept = rememberedMatch(parsed.seats, settings.liveSeatMap, new Set(players.map((p) => p.id)));
    if (kept) {
      const written = await applyLiveState(game.id, parsed.seats, kept);
      await ensureStThreadsIfRunning(interaction.client, game);
      if (written > 0) await ctx.notify(GameEvents.Changed);
      await toast.ephemeral(interaction, S.games.liveApplied(written), { accent: accent.success });
      return;
    }

    const names = await displayNames(
      interaction.client,
      game.guild,
      players.map((p) => p.member),
    );
    const map = matchLiveSeats(
      parsed.seats,
      players.map((p) => ({
        id: p.id,
        names: [names[String(p.member)], rows.find((row) => row.seat.player === p.id)?.seat.nickname].filter(
          (n): n is string => typeof n === 'string',
        ),
      })),
      settings.liveSeatMap,
    );

    await ctx.spawnView(
      'gseatlive',
      { interaction },
      { visibility: 'ephemeral', state: { seats: parsed.seats, map, page: 0 } },
    );
  },
});

const setMode =
  (mode: Mode): InteractionHandler<SeatingState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();
    await ctx.updateState({ mode });
    return { action: 'render' };
  };

const current = async (ctx: ViewContext<SeatingState>) => {
  const rows = await listSeating(ctx.view.entityId!);
  return { rows, seat: picked(rows, ctx.view) };
};

const withSeat = async (
  interaction: ViewInteraction,
  ctx: ViewContext<SeatingState>,
  act: (seat: SeatedPlayer, rows: SeatedPlayer[]) => Promise<void>,
): Promise<HandlerResult> => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  const { rows, seat } = await current(ctx);
  if (seat) {
    await act(seat, rows);
    await ctx.notify(GameEvents.Changed);
  }

  return { action: 'render' };
};

export default createView<SeatingState>()({
  id: 'gseating',
  idParams: [],
  events: {},
  defaultState: { seat: null, mode: null },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const [rows, unseated, settings] = await Promise.all([
      listSeating(game.id),
      listUnseatedPlayers(game.id),
      getOrCreateGameSettings(game.id),
    ]);
    const [names, name] = await Promise.all([
      displayNames(client, game.guild, [...rows.map((r) => r.member), ...unseated.map((p) => p.member)]),
      namer(
        client,
        game.guild,
        view.channel,
        rows.map((r) => r.member),
      ),
    ]);

    const seat = picked(rows, view);
    const mode: Mode = view.state?.mode ?? null;

    const seatSelect = () =>
      selectRow(
        select(view.customId('select'), 'Pick a seat').addOptions(
          rows.map((row) => ({
            label: seatLabel(row, names),
            value: row.seat.id,
            default: row.seat.id === seat?.seat.id,
          })),
        ),
      );

    const cancel = (...others: ReturnType<typeof button>[]) =>
      buttonRow(...others, button(view.customId('cancel'), 'Cancel', ButtonStyle.Secondary));

    const look = roleLook(client, game.guild, characterChoices((await getScriptSummary(game.id))?.json));
    const emote = look.emote;
    // The players see the last publish; the small print says whether this is it.
    const published = isPublished(settings.publishedSeating, rows, settings.rolesLive);
    const body: ReturnType<typeof text>[] = [
      text('### Seating'),
      text(townSquare(rows, look, name)),
      text(
        settings.publishedAt === null
          ? '-# Not yet published.'
          : published
            ? `-# Published ${time(settings.publishedAt, TimestampStyles.RelativeTime)}.`
            : `-# Unpublished changes since ${time(settings.publishedAt, TimestampStyles.RelativeTime)}.`,
      ),
    ];
    const controls: (ReturnType<typeof buttonRow> | ReturnType<typeof selectRow>)[] = [];

    if (mode === 'add') {
      body.push(text(unseated.length > 0 ? 'Who takes the next seats?' : 'Every player is seated.'));
      if (unseated.length > 0) {
        controls.push(
          selectRow(
            select(view.customId('add-pick'), 'Players to seat')
              .setMinValues(1)
              .setMaxValues(Math.min(unseated.length, 25))
              .addOptions(
                unseated.slice(0, 25).map((p) => ({ label: names[String(p.member)] ?? String(p.member), value: p.id })),
              ),
          ),
        );
      }
      controls.push(cancel());
      if (rows.length > 0) controls.push(seatSelect());
    } else if ((mode === 'move' || mode === 'swap') && seat) {
      const verb = mode === 'move' ? 'Move' : 'Swap';
      const targets = rows.filter((row) => row.seat.id !== seat.seat.id);
      body.push(text(`${verb} **${seatLabel(seat, names)}** ${mode === 'move' ? 'to the seat of' : 'with'}…`));
      controls.push(
        selectRow(
          select(view.customId(mode === 'move' ? 'move-to' : 'swap-with'), `${verb}…`).addOptions(
            targets.map((row) => ({ label: seatLabel(row, names), value: row.seat.id })),
          ),
        ),
        cancel(),
      );
    } else if (mode === 'associate' && seat) {
      body.push(
        text(
          unseated.length > 0
            ? `Who takes seat ${seat.seat.seat}?${seat.member === null ? '' : ' The current occupant stays a Player, unseated.'}`
            : 'Every Player is seated already; add one from Members first.',
        ),
      );
      if (unseated.length > 0) {
        controls.push(
          selectRow(
            select(view.customId('associate-pick'), 'Unseated players').addOptions(
              unseated.slice(0, 25).map((p) => ({ label: names[String(p.member)] ?? String(p.member), value: p.id })),
            ),
          ),
        );
      }
      controls.push(cancel());
    } else {
      controls.push(
        buttonRow(
          button(view.customId('seat-all'), `Seat all (${unseated.length})`, ButtonStyle.Primary).setDisabled(
            unseated.length === 0,
          ),
          button(view.customId('add'), 'Add player', ButtonStyle.Secondary).setDisabled(unseated.length === 0),
          button(view.customId('add-empty'), 'Add empty', ButtonStyle.Secondary),
          button(view.customId('publish'), 'Publish', ButtonStyle.Success).setDisabled(published),
          button(view.customId('live'), 'Upload clocktower.live', ButtonStyle.Secondary),
        ),
      );
      if (rows.length > 0) controls.push(seatSelect());
      if (seat) {
        controls.push(
          selectRow(
            select(view.customId('state'), 'State').addOptions(
              STATES.map((s) => {
                const found = emote(s.emote);
                return {
                  label: s.label,
                  value: s.value,
                  default: s.value === seat.seat.state,
                  ...(found ? { emoji: { id: found.id, name: found.name, animated: found.animated } } : {}),
                };
              }),
            ),
          ),
          // What the seat is: roles (and traveler, on that pane), nickname, player.
          buttonRow(
            button(view.customId('roles'), 'Set roles', ButtonStyle.Primary),
            button(view.customId('nickname'), 'Set nickname', ButtonStyle.Secondary),
            button(view.customId('associate'), 'Set player', ButtonStyle.Secondary),
            // Mid-game, a seat added before this existed may have no thread; this makes any missing.
            ...(game.state === 'running'
              ? [button(view.customId('st-thread'), 'ST thread', ButtonStyle.Secondary)]
              : []),
          ),
          // Where the seat is: the movement cursor, and Remove.
          buttonRow(
            button(view.customId('move'), 'Move to…', ButtonStyle.Secondary).setDisabled(rows.length < 2),
            button(view.customId('swap'), 'Swap with…', ButtonStyle.Secondary).setDisabled(rows.length < 2),
            button(view.customId('remove'), 'Remove', ButtonStyle.Danger),
          ),
        );
      }
    }

    return v2(linear(...body, separator(), ...controls));
  },

  interactions: {
    ...nicknameForm.interactions,
    ...liveForm.interactions,

    live: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await liveForm.show(interaction, ctx);
    },

    // What the players see is what this shows now.
    publish: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const settings = await publishSeating(ctx.view.entityId!);
      await ctx.notify(GameEvents.Published);

      const game = await getGame(ctx.view.entityId!);
      const where =
        game?.state !== 'running'
          ? 'Published; the players see it once the game starts.'
          : settings?.seatingThread
            ? 'Published.'
            : 'Published, but no thread shows the square: bind one under Configuration > Seating.';
      await toast.followUp(interaction, where, { accent: accent.success });

      return { action: 'render' };
    },

    'seat-all': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      if ((await seatUnseated(ctx.view.entityId!)) > 0) {
        await ensureStThreadsIfRunning(interaction.client, await getGame(ctx.view.entityId!));
        await ctx.notify(GameEvents.Changed);
      }
      return { action: 'render' };
    },

    // A seat with nobody in it: the Storytellers' to run, or a mechanic's,
    // until Associate player fills it.
    'add-empty': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await addEmptySeat(ctx.view.entityId!);
      await ensureStThreadsIfRunning(interaction.client, await getGame(ctx.view.entityId!));
      await ctx.notify(GameEvents.Changed);
      return { action: 'render' };
    },

    'st-thread': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const game = await getGame(ctx.view.entityId!);
      if (!game || game.state !== 'running') return { action: 'render' };
      const report = await ensureStThreads(interaction.client, game);
      await toast.followUp(interaction, S.games.stThreadsProvided(report.created, report.failed), {
        accent: report.failed.length > 0 ? accent.warning : accent.success,
      });
      return { action: 'render' };
    },

    add: setMode('add'),
    move: setMode('move'),
    swap: setMode('swap'),
    associate: setMode('associate'),
    cancel: setMode(null),

    'add-pick': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      // Only players still unseated, so a stale menu cannot seat anyone twice.
      const unseated = new Set((await listUnseatedPlayers(ctx.view.entityId!)).map((p) => p.id));
      const seated = await seatPlayers(
        ctx.view.entityId!,
        interaction.values.filter((id) => unseated.has(id)),
      );

      await ctx.updateState({ mode: null });
      if (seated > 0) {
        await ensureStThreadsIfRunning(interaction.client, await getGame(ctx.view.entityId!));
        await ctx.notify(GameEvents.Changed);
      }

      return { action: 'render' };
    },

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ seat: interaction.values[0] ?? null, mode: null });
      return { action: 'render' };
    },

    roles: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const { seat } = await current(ctx);
      if (!seat) {
        await interaction.deferUpdate();
        return { action: 'render' };
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView(
        'gseatroles',
        { interaction },
        { visibility: 'ephemeral', state: { seat: seat.seat.id, truePage: 0, apparentPage: 0 } },
      );
    },

    state: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      const picked = STATES.find((s) => s.value === interaction.values[0]);
      return withSeat(interaction, ctx, async (seat) => {
        if (picked) await setSeat(seat.seat.id, { state: picked.value });
      });
    },

    nickname: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const { seat } = await current(ctx);
      if (!seat) {
        await interaction.deferUpdate();
        return { action: 'render' };
      }

      await nicknameForm.show(interaction, ctx, { values: { nickname: seat.seat.nickname ?? '' } });
    },

    'move-to': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const { rows, seat } = await current(ctx);
      const target = rows.find((row) => row.seat.id === interaction.values[0]);
      if (seat && target) {
        await reorder(
          ctx.view.entityId!,
          moveSeat(
            rows.map((row) => row.seat),
            seat.seat.id,
            target.seat.seat,
          ),
        );
        await ctx.notify(GameEvents.Changed);
      }

      await ctx.updateState({ mode: null });
      return { action: 'render' };
    },

    'associate-pick': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const { seat } = await current(ctx);
      const picked = interaction.values[0];
      if (seat && picked) {
        const result = await associate(interaction.client, seat.seat.id, picked);
        if (result.ok) {
          await ensureStThreadsIfRunning(interaction.client, await getGame(ctx.view.entityId!));
          await ctx.notify(GameEvents.Changed);
        }
      }

      await ctx.updateState({ mode: null });
      return { action: 'render' };
    },

    'swap-with': async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const { rows, seat } = await current(ctx);
      const target = rows.find((row) => row.seat.id === interaction.values[0]);
      if (seat && target) {
        await reorder(
          ctx.view.entityId!,
          swapSeats(
            rows.map((row) => row.seat),
            seat.seat.id,
            target.seat.id,
          ),
        );
        await ctx.notify(GameEvents.Changed);
      }

      await ctx.updateState({ mode: null });
      return { action: 'render' };
    },

    remove: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const { seat } = await current(ctx);
      if (seat && (await unseat(interaction.client, seat.seat.id))) {
        await ctx.updateState({ seat: null, mode: null });
        await ctx.notify(GameEvents.Changed);
      }

      return { action: 'render' };
    },
  },
});
