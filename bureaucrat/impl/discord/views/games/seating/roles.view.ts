import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
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
import type { InteractionHandler } from '../../../../../engine/discord/views/types';
import { getGame } from '../../../../../drizzle/games';
import { getScriptSummary } from '../../../../../drizzle/scripts';
import { getSeat, getSeatedPlayer } from '../../../../../drizzle/seating';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { ALIGNMENT_LABEL, nextAlignment, type Alignment } from '../../../games/script/alignment';
import { TEAM_LABEL } from '../../../games/script/characters';
import { setSeat } from '../../../games/seats';
import { GameEvents } from '../events';
import { roleEmote, roleLook, roleOf, TRAVELER_MARK, who, type RoleLook } from './render';
import { namer } from '../../naming';
import { characterChoices, pageOfCharacters } from './roles';

// Each role has its own stack (select plus pager) and so its own page: the two
// are picked independently and a shared page was hard to follow.
type RolesState = { seat: string; truePage: number; apparentPage: number };

type Slot = 'true' | 'apparent';

const SLOTS: Record<
  Slot,
  {
    column: 'trueRole' | 'apparentRole';
    align: 'trueAlignment' | 'apparentAlignment';
    page: 'truePage' | 'apparentPage';
    placeholder: string;
  }
> = {
  true: { column: 'trueRole', align: 'trueAlignment', page: 'truePage', placeholder: 'True role' },
  apparent: { column: 'apparentRole', align: 'apparentAlignment', page: 'apparentPage', placeholder: 'Apparent role' },
};

const dismiss = dismissButton<RolesState>()({ action: 'dismiss' });

const custom = modal<RolesState>()({
  action: 'custom',
  title: 'Roles',
  fields: {
    trueRole: field.short('True role', { required: false, maxLength: 60 }),
    apparentRole: field.short('Apparent role', { required: false, maxLength: 60 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    await setSeat(ctx.view.state!.seat, {
      trueRole: values['trueRole']?.trim() || null,
      apparentRole: values['apparentRole']?.trim() || null,
    });
    await ctx.notify(GameEvents.Changed);

    return { action: 'render' };
  },
});

const pick =
  (slot: Slot): InteractionHandler<RolesState> =>
  async (interaction, ctx) => {
    if (!interaction.isStringSelectMenu()) return;
    await interaction.deferUpdate();

    // A select cleared (no values) clears the role.
    const picked = interaction.values[0];
    const script = picked ? await getScriptSummary(ctx.view.entityId!) : null;
    const character = picked ? characterChoices(script?.json)?.find((c) => c.id === picked) : null;
    if (!picked || character) {
      await setSeat(ctx.view.state!.seat, { [SLOTS[slot].column]: character?.name ?? null });
      await ctx.notify(GameEvents.Changed);
    }

    return { action: 'render' };
  };

const turn =
  (slot: Slot, by: number): InteractionHandler<RolesState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();
    const key = SLOTS[slot].page;
    await ctx.updateState({ [key]: Math.max(0, (ctx.view.state?.[key] ?? 0) + by) });
    return { action: 'render' };
  };

// The readout between the arrows is disabled and never arrives.
const noop: InteractionHandler<RolesState> = async () => undefined;

// Default, good, evil: the slot's override, kept across picks.
const align =
  (slot: Slot): InteractionHandler<RolesState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();

    const seat = await getSeat(ctx.view.state!.seat);
    if (seat) {
      await setSeat(seat.id, { [SLOTS[slot].align]: nextAlignment(seat[SLOTS[slot].align]) });
      await ctx.notify(GameEvents.Changed);
    }

    return { action: 'render' };
  };

// Every option is drawn in the slot's override, so the Storyteller sees what a pick gives.
const optionsFor = (
  items: ReturnType<typeof pageOfCharacters>['items'],
  current: string | null,
  look: RoleLook,
  alignment: Alignment | null,
) =>
  items.map((c) => {
    const found = roleEmote(c.name, look, alignment);
    return {
      label: c.name,
      value: c.id,
      description: TEAM_LABEL[c.team],
      default: c.name === current,
      ...(found ? { emoji: { id: found.id, name: found.name, animated: found.animated } } : {}),
    };
  });

// Ephemeral, opened from a picked seat: the true and apparent roles from the
// script's characters when there is a script, or typed by hand.
export default createView<RolesState>()({
  id: 'gseatroles',
  idParams: [],
  events: {},
  defaultState: { seat: '', truePage: 0, apparentPage: 0 },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: {
    '*': [inGuild],
    'true-pick': [storytells],
    'apparent-pick': [storytells],
    'true-prev': [storytells],
    'true-next': [storytells],
    'apparent-prev': [storytells],
    'apparent-next': [storytells],
    'true-align': [storytells],
    'apparent-align': [storytells],
    custom: [storytells],
    traveler: [storytells],
    'custom-submit': [storytells],
  },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const [game, row, script] = await Promise.all([
      getGame(view.entityId!),
      getSeatedPlayer(view.state!.seat),
      getScriptSummary(view.entityId!),
    ]);
    if (!game || !row) {
      return v2(linear(text('That seat is gone.'), separator(), dismiss.row(view)).setAccentColor(accent.warning));
    }

    const characters = characterChoices(script?.json);
    const look = roleLook(client, game.guild, characters);
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    // One stack per role: its select over the current page, then `< n / N >`.
    const stackFor = (slot: Slot) => {
      if (!characters) return [];
      const spec = SLOTS[slot];
      const paged = pageOfCharacters(characters, view.state?.[spec.page] ?? 0);
      return [
        selectRow(
          select(customId(`${slot}-pick`), spec.placeholder)
            .setMinValues(0)
            .addOptions(optionsFor(paged.items, seat[spec.column], look, seat[spec.align])),
        ),
        buttonRow(
          button(customId(`${slot}-prev`), '<', ButtonStyle.Secondary).setDisabled(paged.page === 0),
          button(customId(`${slot}-page`), `${paged.page + 1} / ${paged.pages}`, ButtonStyle.Secondary).setDisabled(
            true,
          ),
          button(customId(`${slot}-next`), '>', ButtonStyle.Secondary).setDisabled(paged.page >= paged.pages - 1),
          alignButton(slot),
        ),
      ];
    };

    const { seat } = row;

    // The slot's override: Default leaves each role to its team.
    const alignButton = (slot: Slot) => {
      const current = seat[SLOTS[slot].align];
      return button(
        customId(`${slot}-align`),
        current ? ALIGNMENT_LABEL[current] : 'Default',
        current === 'good' ? ButtonStyle.Success : current === 'evil' ? ButtonStyle.Danger : ButtonStyle.Secondary,
      );
    };

    const name = await namer(client, game.guild, view.channel, [row.member]);
    const line = seat.trueRole ? `${who(row, name)} is${roleOf(row, look)}.` : `${who(row, name)} has no role yet.`;

    return v2(
      linear(
        text(line),
        separator(),
        ...(characters ? [...stackFor('true'), ...stackFor('apparent')] : [text('There is no script.json.')]),
        separator(),
        buttonRow(
          button(view.customId('custom'), 'Set custom', ButtonStyle.Primary),
          button(
            view.customId('traveler'),
            `${TRAVELER_MARK} Traveler · ${seat.traveler ? 'yes' : 'no'}`,
            seat.traveler ? ButtonStyle.Success : ButtonStyle.Secondary,
          ),
          dismiss.button(view),
        ),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...custom.interactions,

    'true-pick': pick('true'),
    'true-prev': turn('true', -1),
    'true-page': noop,
    'true-next': turn('true', 1),
    'apparent-pick': pick('apparent'),
    'apparent-prev': turn('apparent', -1),
    'apparent-page': noop,
    'apparent-next': turn('apparent', 1),
    'true-align': align('true'),
    'apparent-align': align('apparent'),

    traveler: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      const seat = await getSeat(ctx.view.state!.seat);
      if (seat) {
        await setSeat(seat.id, { traveler: !seat.traveler });
        await ctx.notify(GameEvents.Changed);
      }
      return { action: 'render' };
    },

    custom: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const seat = await getSeat(ctx.view.state!.seat);
      await custom.show(interaction, ctx, {
        values: { trueRole: seat?.trueRole ?? '', apparentRole: seat?.apparentRole ?? '' },
      });
    },
  },
});
