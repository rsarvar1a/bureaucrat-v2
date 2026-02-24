import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { destroyView } from '../../frameworks/views/lifecycle';
import { confirmButton } from './confirm';
import type { ViewRow, ViewContext, ViewInteraction, InteractionHandler } from '../../frameworks/views/types';

type DismissOptions<S, A extends string> = {
  notify?: string[];
  onDismiss?: (ctx: ViewContext<S>, interaction: ViewInteraction) => Promise<void>;
  action: A;
  label?: string;
  style?: ButtonStyle;
  confirm?: boolean;
};

type Dismiss<S, A extends string> = {
  button: (view: ViewRow<S>) => ButtonBuilder;
  row: (view: ViewRow<S>) => ActionRowBuilder<ButtonBuilder>;
  isConfirming: (view: ViewRow<S>) => boolean;
  confirmRow: (view: ViewRow<S>) => ActionRowBuilder<ButtonBuilder>;
  interactions: Record<A, InteractionHandler<S>>;
};

export const dismissButton =
  <S>() =>
  <A extends string>(options: DismissOptions<S, A>): Dismiss<S, A> => {
    const { notify, onDismiss, action, label = 'Dismiss', style = ButtonStyle.Secondary, confirm = false } = options;

    const performDismiss = async (ctx: ViewContext<S>, interaction: ViewInteraction) => {
      if (onDismiss) await onDismiss(ctx, interaction);
      await destroyView(ctx.view.id);
      if (notify && notify.length > 0) await ctx.notify(...notify);
      await interaction.deleteReply();
    };

    if (confirm) {
      const inner = confirmButton<S>()({
        action,
        label,
        style,
        onConfirm: performDismiss,
      });

      return {
        ...inner,
        interactions: inner.interactions as Record<string, InteractionHandler<S>>,
      };
    }

    const button = (view: ViewRow<S>) =>
      new ButtonBuilder().setCustomId(view.customId(action)).setLabel(label).setStyle(style);

    const row = (view: ViewRow<S>) => new ActionRowBuilder<ButtonBuilder>().addComponents(button(view));

    const handler: InteractionHandler<S> = async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await performDismiss(ctx, interaction);
    };

    return {
      button,
      row,
      isConfirming: () => false as const,
      confirmRow: () => new ActionRowBuilder<ButtonBuilder>(),
      interactions: { [action]: handler } as Record<string, InteractionHandler<S>>,
    };
  };
