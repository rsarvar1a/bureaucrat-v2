import { ButtonStyle } from 'discord.js';
import { button, buttonRow } from '../../elements';
import type { ViewRow, ViewContext, ViewInteraction, InteractionHandler } from '../../frameworks/views/types';

type ConfirmOptions<S, A extends string> = {
  action: A;
  label: string;
  style?: ButtonStyle;
  onConfirm: (ctx: ViewContext<S>, interaction: ViewInteraction) => Promise<void>;
};

export type ConfirmState<A extends string> = { [K in `confirming:${A}`]?: boolean };

export type ConfirmActions<A extends string> = A | `${A}-confirm` | `${A}-cancel`;

type Confirm<S, A extends string> = {
  button: (view: ViewRow<S>) => ReturnType<typeof button>;
  row: (view: ViewRow<S>) => ReturnType<typeof buttonRow>;
  isConfirming: (view: ViewRow<S>) => boolean;
  confirmRow: (view: ViewRow<S>) => ReturnType<typeof buttonRow>;
  interactions: Record<ConfirmActions<A>, InteractionHandler<S>>;
};

export const confirmButton =
  <S>() =>
  <A extends string>(options: ConfirmOptions<S, A>): Confirm<S, A> => {
    const { action, label, style = ButtonStyle.Danger, onConfirm } = options;

    const btn = (view: ViewRow<S>) => button(view.customId(action), label, style);

    const row = (view: ViewRow<S>) => buttonRow(btn(view));

    const isConfirming = (view: ViewRow<S>): boolean =>
      !!((view.state as Record<string, unknown> | null) ?? {})[`confirming:${action}`];

    const confirmRow = (view: ViewRow<S>) =>
      buttonRow(
        button(view.customId(`${action}-confirm`), 'Confirm', ButtonStyle.Danger),
        button(view.customId(`${action}-cancel`), 'Cancel', ButtonStyle.Secondary),
      );

    const setConfirming = (value: boolean) => async (ctx: ViewContext<S>) => {
      await (ctx.updateState as (patch: Record<string, unknown>) => Promise<void>)({
        [`confirming:${action}`]: value,
      });
    };

    const interactions = {
      [action]: async (interaction, ctx) => {
        if (!interaction.isMessageComponent()) return;
        await interaction.deferUpdate();
        await setConfirming(true)(ctx);
        return { action: 'render' };
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
        return { action: 'render' };
      },
    } satisfies Record<string, InteractionHandler<S>>;

    return {
      button: btn,
      row,
      isConfirming,
      confirmRow,
      interactions: interactions as Record<ConfirmActions<A>, InteractionHandler<S>>,
    };
  };
