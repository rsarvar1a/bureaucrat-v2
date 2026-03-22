import { ButtonStyle } from 'discord.js';
import { button, buttonRow } from '../../elements';
import { destroyView } from '../../frameworks/views/lifecycle';
import { confirmButton, type ConfirmActions } from './confirm';
import { tryDeleteReply } from '../../../utilities/reply';
import type { ViewRow, ViewContext, ViewInteraction, InteractionHandler } from '../../frameworks/views/types';

type DismissOptionsBase<S, A extends string> = {
  notify?: string[];
  onDismiss?: (ctx: ViewContext<S>, interaction: ViewInteraction) => Promise<void>;
  action: A;
  label?: string;
  style?: ButtonStyle;
};

type DismissBase<S> = {
  button: (view: ViewRow<S>) => ReturnType<typeof button>;
  row: (view: ViewRow<S>) => ReturnType<typeof buttonRow>;
};

type DismissSimple<S, A extends string> = DismissBase<S> & {
  interactions: Record<A, InteractionHandler<S>>;
};

type DismissWithConfirm<S, A extends string> = DismissBase<S> & {
  isConfirming: (view: ViewRow<S>) => boolean;
  confirmRow: (view: ViewRow<S>) => ReturnType<typeof buttonRow>;
  interactions: Record<ConfirmActions<A>, InteractionHandler<S>>;
};

export const dismissButton = <S>() => {
  function dismiss<A extends string>(options: DismissOptionsBase<S, A> & { confirm: true }): DismissWithConfirm<S, A>;
  function dismiss<A extends string>(options: DismissOptionsBase<S, A> & { confirm?: false }): DismissSimple<S, A>;
  function dismiss<A extends string>(
    options: DismissOptionsBase<S, A> & { confirm?: boolean },
  ): DismissSimple<S, A> | DismissWithConfirm<S, A> {
    const { notify, onDismiss, action, label = 'Dismiss', style = ButtonStyle.Secondary, confirm = false } = options;

    const performDismiss = async (ctx: ViewContext<S>, interaction: ViewInteraction) => {
      if (onDismiss) await onDismiss(ctx, interaction);
      await destroyView(ctx.view.id);
      if (notify && notify.length > 0) await ctx.notify(...notify);
      await tryDeleteReply(interaction);
    };

    if (confirm) {
      const inner = confirmButton<S>()({
        action,
        label,
        style,
        onConfirm: performDismiss,
      });

      return { ...inner };
    }

    const btn = (view: ViewRow<S>) => button(view.customId(action), label, style);

    const row = (view: ViewRow<S>) => buttonRow(btn(view));

    const handler: InteractionHandler<S> = async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await performDismiss(ctx, interaction);
    };

    return {
      button: btn,
      row,
      interactions: { [action]: handler } as Record<A, InteractionHandler<S>>,
    };
  }

  return dismiss;
};
