import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createView } from '../frameworks/views/create-view';
import { buildCustomId } from '../frameworks/views/custom-id';
import type { ViewRow } from '../frameworks/views/types';

type CounterState = {
  value: number;
  label: string;
};

const CounterEvents = {
  ValueUpdated: 'counter::${counter}::value',
  LabelUpdated: 'counter::${counter}::label',
} as const;

export default createView<CounterState, typeof CounterEvents>({
  id: 'counter',
  idParams: ['counter'],
  events: CounterEvents,
  defaultState: { value: 0, label: 'clicks' },

  subscribesTo: ['ValueUpdated', 'LabelUpdated'],

  render: async (view: ViewRow<CounterState>) => {
    const { value, label } = view.state ?? { value: 0, label: 'clicks' };

    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Counter`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${value}** ${label}`))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::counter', 'increment', view.id))
            .setLabel('+')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::counter', 'decrement', view.id))
            .setLabel('-')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(buildCustomId('view::counter', 'what', view.id))
            .setLabel('What?')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .setAccentColor(0x5865f2);

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
  },

  interactions: {
    increment: async (interaction, ctx) => {
      await interaction.deferUpdate();
      await ctx.mutateAndNotify({ value: (ctx.view.state?.value ?? 0) + 1 }, CounterEvents.ValueUpdated);
      return { action: 'rerender' };
    },

    decrement: async (interaction, ctx) => {
      await interaction.deferUpdate();
      await ctx.mutateAndNotify({ value: (ctx.view.state?.value ?? 0) - 1 }, CounterEvents.ValueUpdated);
      return { action: 'rerender' };
    },

    what: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const modal = new ModalBuilder()
        .setCustomId(buildCustomId('view::counter', 'what-submit', ctx.view.id))
        .setTitle('Change Label')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('label')
              .setLabel('New label')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., bananas')
              .setRequired(true),
          ),
        );

      await interaction.showModal(modal);
    },

    'what-submit': async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;

      await interaction.deferUpdate();
      const label = interaction.fields.getTextInputValue('label');
      await ctx.mutateAndNotify({ label }, CounterEvents.LabelUpdated);
      return { action: 'rerender' };
    },
  },
});
