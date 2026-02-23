import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildCustomId } from '../../frameworks/views/custom-id';
import { destroyView } from '../../frameworks/views/lifecycle';
import { confirmButton } from './confirm';
import type { ViewRow, ViewContext, ViewInteraction, InteractionHandler } from '../../frameworks/views/types';

type DismissOptions<S> = {
  notify?: string[];
  onDismiss?: (ctx: ViewContext<S>, interaction: ViewInteraction) => Promise<void>;
  action?: string;
  label?: string;
  style?: ButtonStyle;
  confirm?: boolean;
};

export const dismissButton = <S = unknown>(options?: DismissOptions<S>) => {
  const {
    notify,
    onDismiss,
    action = 'dismiss',
    label = 'Dismiss',
    style = ButtonStyle.Secondary,
    confirm = false,
  } = options ?? {};

  const performDismiss = async (ctx: ViewContext<S>, interaction: ViewInteraction) => {
    if (onDismiss) await onDismiss(ctx, interaction);
    await destroyView(ctx.view.id);
    if (notify && notify.length > 0) await ctx.notify(...notify);
    await interaction.deleteReply();
  };

  if (confirm) {
    const inner = confirmButton<S>({
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
    new ButtonBuilder()
      .setCustomId(buildCustomId('view::' + view.route, action, view.id))
      .setLabel(label)
      .setStyle(style);

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
