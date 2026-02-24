import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ModalSubmitInteraction } from 'discord.js';
import type { HandlerResult, InteractionHandler, ViewContext } from '../../frameworks/views/types';

type FieldOptions = {
  description?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  value?: string;
};

type FieldDefinition = FieldOptions & {
  label: string;
  style: TextInputStyle;
};

const makeField =
  (style: TextInputStyle) =>
  (label: string, options?: FieldOptions): FieldDefinition => ({
    label,
    style,
    ...options,
  });

export const field = {
  short: makeField(TextInputStyle.Short),
  paragraph: makeField(TextInputStyle.Paragraph),
};

type ModalOptions<S, A extends string> = {
  action: A;
  title: string;
  fields: Record<string, FieldDefinition>;
  onSubmit: (
    values: Record<string, string>,
    interaction: ModalSubmitInteraction,
    ctx: ViewContext<S>,
  ) => Promise<HandlerResult>;
};

type Modal<S, A extends string> = {
  show: (
    interaction: { showModal(modal: ModalBuilder): Promise<void> },
    ctx: ViewContext<S>,
    overrides?: { title?: string; values?: Record<string, string> },
  ) => Promise<void>;
  interactions: Record<`${A}-submit`, InteractionHandler<S>>;
};

export const modal =
  <S>() =>
  <A extends string>(options: ModalOptions<S, A>): Modal<S, A> => {
    const { action, title, fields, onSubmit } = options;
    const submitAction = `${action}-submit`;

    const show = async (
      interaction: { showModal(modal: ModalBuilder): Promise<void> },
      ctx: ViewContext<S>,
      overrides?: { title?: string; values?: Record<string, string> },
    ) => {
      const modalBuilder = new ModalBuilder()
        .setCustomId(ctx.view.customId(submitAction))
        .setTitle(overrides?.title ?? title);

      for (const [customId, fieldDef] of Object.entries(fields)) {
        const input = new TextInputBuilder()
          .setCustomId(customId)
          .setStyle(fieldDef.style)
          .setRequired(fieldDef.required ?? true);
        if (fieldDef.maxLength != null) input.setMaxLength(fieldDef.maxLength);
        if (fieldDef.minLength != null) input.setMinLength(fieldDef.minLength);
        if (fieldDef.placeholder) input.setPlaceholder(fieldDef.placeholder);

        const val = overrides?.values?.[customId] ?? fieldDef.value;
        if (val != null) input.setValue(val);

        const label = new LabelBuilder().setLabel(fieldDef.label).setTextInputComponent(input);
        if (fieldDef.description) label.setDescription(fieldDef.description);

        modalBuilder.addLabelComponents(label);
      }

      await interaction.showModal(modalBuilder);
    };

    const handler: InteractionHandler<S> = async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;

      const values: Record<string, string> = {};
      for (const key of Object.keys(fields)) {
        values[key] = interaction.fields.getTextInputValue(key);
      }

      return onSubmit(values, interaction, ctx);
    };

    return {
      show,
      interactions: { [submitAction]: handler } as Record<string, InteractionHandler<S>>,
    };
  };
