import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ViewRow, ViewContext, ViewInteraction, InteractionHandler } from '../../frameworks/views/types';

type ConfirmOptions<S> = {
  action: string;
  label: string;
  style?: ButtonStyle;
  onConfirm: (ctx: ViewContext<S>, interaction: ViewInteraction) => Promise<void>;
};

export const confirmButton = <S = unknown>(options: ConfirmOptions<S>) => {
  const { action, label, style = ButtonStyle.Danger, onConfirm } = options;

  const button = (view: ViewRow<S>) =>
    new ButtonBuilder().setCustomId(view.customId(action)).setLabel(label).setStyle(style);

  const row = (view: ViewRow<S>) => new ActionRowBuilder<ButtonBuilder>().addComponents(button(view));

  const isConfirming = (view: ViewRow<S>): boolean =>
    !!((view.state as Record<string, unknown> | null) ?? {})['confirming'];

  const confirmRow = (view: ViewRow<S>) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(view.customId(`${action}-confirm`))
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(view.customId(`${action}-cancel`))
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

  const setConfirming = (value: boolean) => async (ctx: ViewContext<S>) => {
    await (ctx.updateState as (patch: Record<string, unknown>) => Promise<void>)({
      confirming: value,
    });
  };

  const interactions: Record<string, InteractionHandler<S>> = {
    [action]: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await setConfirming(true)(ctx);
      return { action: 'rerender' };
    },

    [`${action}-confirm`]: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await onConfirm(ctx, interaction);
    },

    [`${action}-cancel`]: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await setConfirming(false)(ctx);
      return { action: 'rerender' };
    },
  };

  return {
    button,
    row,
    isConfirming,
    confirmRow,
    interactions,
  };
};
