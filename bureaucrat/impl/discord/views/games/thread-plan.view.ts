import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../engine/discord/components/modal';
import { text, separator, linear, buttonRow, button, selectRow, select, v2 } from '../../../../engine/discord/elements';
import { getOrCreateGameSettings, updateGameSettings } from '../../../../drizzle/game-settings';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { GameEvents } from './events';

/** The planned thread picked in the select, by position: names may repeat, positions cannot. */
type PlanState = { selected: number | null };

const MAX_THREADS = 25;

/** The chosen position while it still points at a thread; a plan that shrank underneath it clears it. */
const selectedOf = (state: PlanState | null, planned: string[]): number | null =>
  state?.selected !== null && state?.selected !== undefined && state.selected < planned.length ? state.selected : null;

const addModal = modal<PlanState>()({
  action: 'add',
  title: 'Plan a public thread',
  fields: { name: field.short('Thread name', { maxLength: 100 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const settings = await getOrCreateGameSettings(ctx.view.entityId!);
    const name = values['name']!.trim();
    if (!name || settings.plannedThreads.length >= MAX_THREADS) return { action: 'render' };

    await updateGameSettings(ctx.view.entityId!, { plannedThreads: [...settings.plannedThreads, name] });
    await ctx.notify(GameEvents.Changed);

    return { action: 'render' };
  },
});

const renameModal = modal<PlanState>()({
  action: 'rename',
  title: 'Rename the thread',
  fields: { name: field.short('Thread name', { maxLength: 100 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const settings = await getOrCreateGameSettings(ctx.view.entityId!);
    const index = selectedOf(ctx.view.state, settings.plannedThreads);
    const name = values['name']!.trim();
    if (index === null || !name) return { action: 'render' };

    // The bindings hold the thread by name and follow it.
    const old = settings.plannedThreads[index]!;
    const follow = (bound: string | null) => (bound === old ? name : bound);
    await updateGameSettings(ctx.view.entityId!, {
      plannedThreads: settings.plannedThreads.map((t, i) => (i === index ? name : t)),
      nominationThread: follow(settings.nominationThread),
      scriptThread: follow(settings.scriptThread),
      seatingThread: follow(settings.seatingThread),
      whisperThread: follow(settings.whisperThread),
    });
    await ctx.notify(GameEvents.Changed);

    return { action: 'render' };
  },
});

export default createView<PlanState>()({
  id: 'gthreadplan',
  idParams: [],
  events: {},
  defaultState: { selected: null },
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const { plannedThreads } = await getOrCreateGameSettings(view.entityId!);
    const selected = selectedOf(view.state, plannedThreads);

    const list =
      plannedThreads.length === 0
        ? '*No public threads planned.*'
        : plannedThreads.map((name, i) => `${i + 1}. ${name}`).join('\n');

    return v2(
      linear(
        text('### Public threads'),
        text('Created in the game channel when the game starts.'),
        separator(),
        text(list),
        separator(),
        ...(plannedThreads.length > 0
          ? [
              selectRow(
                select(view.customId('select'), 'Select a thread')
                  .setMinValues(0)
                  .addOptions(
                    plannedThreads.map((name, i) => ({
                      label: name.slice(0, 100),
                      value: String(i),
                      default: i === selected,
                    })),
                  ),
              ),
            ]
          : []),
        buttonRow(
          button(view.customId('add'), 'Add', ButtonStyle.Primary).setDisabled(plannedThreads.length >= MAX_THREADS),
          button(view.customId('rename'), 'Rename', ButtonStyle.Secondary).setDisabled(selected === null),
          button(view.customId('delete'), 'Delete', ButtonStyle.Danger).setDisabled(selected === null),
        ),
      ),
    );
  },

  interactions: {
    ...addModal.interactions,
    ...renameModal.interactions,

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const index = Number(interaction.values[0]);
      await ctx.updateState({ selected: Number.isInteger(index) ? index : null });

      return { action: 'render' };
    },

    add: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await addModal.show(interaction, ctx);
    },

    rename: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      const index = selectedOf(ctx.view.state, settings.plannedThreads);
      if (index === null) {
        await interaction.deferUpdate();
        return { action: 'render' };
      }

      await renameModal.show(interaction, ctx, { values: { name: settings.plannedThreads[index]! } });
    },

    delete: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      const index = selectedOf(ctx.view.state, settings.plannedThreads);
      if (index === null) return { action: 'render' };

      await updateGameSettings(ctx.view.entityId!, {
        plannedThreads: settings.plannedThreads.filter((_, i) => i !== index),
      });
      await ctx.updateState({ selected: null });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },
  },
});
