import {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APISelectMenuOption,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { HandlerResult, InteractionHandler, ViewContext } from '../views/types';

type FieldOptions = {
  description?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  value?: string;
};

/** A text input: short or paragraph. `type` may be omitted - it is the original, and the default. */
export type TextFieldDefinition = FieldOptions & {
  type?: 'text';
  label: string;
  style: TextInputStyle;
};

/**
 * A file-upload input: the modal hands back attachments rather than text.
 *
 * Discord's control takes any file; `accept` narrows it after the fact, as a
 * MIME type (`image/png`) or a family (`image/`), and the intake refuses the
 * rest before anything is downloaded. Count bounds let a puzzle ask for
 * exactly one photo or up to several.
 */
export type FileFieldDefinition = {
  type: 'file';
  label: string;
  description?: string;
  required?: boolean;
  /** Accepted MIME types or `family/` prefixes; omitted means anything. */
  accept?: string[];
  /** Attachment count bounds, both inclusive; Discord allows 1..10. */
  minFiles?: number;
  maxFiles?: number;
};

/**
 * A string select inside the modal: the player picks from a closed list and
 * the submit hands back the chosen values.
 *
 * The options may be fixed here or supplied when the modal is shown
 * (`show(..., { options })`), for a list that comes from the database: the
 * field source is synchronous, and the submit only needs the key.
 */
export type SelectFieldDefinition = {
  type: 'select';
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: APISelectMenuOption[];
  minValues?: number;
  maxValues?: number;
};

/**
 * One field of a modal. A discriminated union so a form can mix pasted text,
 * a pick from a list and uploaded images, and so the parser can read each key
 * the right way.
 */
export type FieldDefinition = TextFieldDefinition | FileFieldDefinition | SelectFieldDefinition;

export const isFileField = (def: FieldDefinition): def is FileFieldDefinition => def.type === 'file';
export const isSelectField = (def: FieldDefinition): def is SelectFieldDefinition => def.type === 'select';

/** What an upload field hands back, per attachment. The URL expires within a day - download promptly. */
export type UploadedFile = {
  name: string;
  url: string;
  size: number;
  contentType: string | null;
};

/** A submitted field's value: text for a text field, the picks for a select, the attachments for a file field. */
export type FieldValue = string | string[] | UploadedFile[];

/**
 * The values a form yields, typed from its declaration: a text key is a
 * string, a select key the chosen values, a file key an attachment list. A
 * form resolved at open time (`FieldSource` as a function) cannot be typed
 * this precisely and yields the union per key, which its handler narrows with
 * `isFileField` or a `typeof`.
 */
export type ValuesOf<F extends Record<string, FieldDefinition>> = {
  [K in keyof F]: F[K] extends FileFieldDefinition
    ? UploadedFile[]
    : F[K] extends SelectFieldDefinition
      ? string[]
      : F[K] extends TextFieldDefinition
        ? string
        : FieldValue;
};

/**
 * The fields a modal shows, fixed or decided when it opens.
 *
 * A function when the form depends on where the player is standing - a POI's
 * own prompt cannot be known when the view is declared. Resolved again on
 * submit, so the handler reads exactly the keys it asked for.
 */
export type FieldSource<S> =
  | Record<string, FieldDefinition>
  | ((ctx: ViewContext<S>) => Record<string, FieldDefinition>);

type FieldsOf<Src> = Src extends (ctx: never) => infer R
  ? R extends Record<string, FieldDefinition>
    ? R
    : Record<string, FieldDefinition>
  : Src extends Record<string, FieldDefinition>
    ? Src
    : Record<string, FieldDefinition>;

const resolveFields = <S>(source: FieldSource<S>, ctx: ViewContext<S>): Record<string, FieldDefinition> =>
  typeof source === 'function' ? source(ctx) : source;

const makeField =
  (style: TextInputStyle) =>
  (label: string, options?: FieldOptions): TextFieldDefinition => ({
    label,
    style,
    ...options,
  });

type FileFieldOptions = Omit<FileFieldDefinition, 'type' | 'label'>;
type SelectFieldOptions = Omit<SelectFieldDefinition, 'type' | 'label'>;

/** The image families the intake and the viewers know how to show inline. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const field = {
  short: makeField(TextInputStyle.Short),
  paragraph: makeField(TextInputStyle.Paragraph),
  /** Any file the puzzle cares to accept. */
  file: (label: string, options?: FileFieldOptions): FileFieldDefinition => ({ type: 'file', label, ...options }),
  /** A file field that takes only the common image types. */
  image: (label: string, options?: Omit<FileFieldOptions, 'accept'>): FileFieldDefinition => ({
    type: 'file',
    label,
    accept: IMAGE_TYPES,
    ...options,
  }),
  /** A pick from a list, fixed here or supplied when the modal is shown. */
  select: (label: string, options?: SelectFieldOptions): SelectFieldDefinition => ({
    type: 'select',
    label,
    ...options,
  }),
};

/** What a caller may change about a modal as it opens: its title, text prefills, select options. */
export type ShowOverrides = {
  title?: string;
  values?: Record<string, string>;
  options?: Record<string, APISelectMenuOption[]>;
};

type ModalOptions<S, A extends string, Src extends FieldSource<S>> = {
  action: A;
  title: string;
  fields: Src;
  onSubmit: (
    values: ValuesOf<FieldsOf<Src>>,
    interaction: ModalSubmitInteraction,
    ctx: ViewContext<S>,
  ) => Promise<HandlerResult>;
};

type Modal<S, A extends string> = {
  show: (
    interaction: { showModal(modal: ModalBuilder): Promise<void> },
    ctx: ViewContext<S>,
    overrides?: ShowOverrides,
  ) => Promise<void>;
  interactions: Record<`${A}-submit`, InteractionHandler<S>>;
};

export const modal =
  <S>() =>
  <A extends string, Src extends FieldSource<S>>(options: ModalOptions<S, A, Src>): Modal<S, A> => {
    const { action, title, fields, onSubmit } = options;
    const submitAction = `${action}-submit`;

    const show = async (
      interaction: { showModal(modal: ModalBuilder): Promise<void> },
      ctx: ViewContext<S>,
      overrides?: ShowOverrides,
    ) => {
      const modalBuilder = new ModalBuilder()
        .setCustomId(ctx.view.customId(submitAction))
        .setTitle(overrides?.title ?? title);

      for (const [customId, fieldDef] of Object.entries(resolveFields(fields, ctx))) {
        const label = new LabelBuilder().setLabel(fieldDef.label);
        if (fieldDef.description) label.setDescription(fieldDef.description);

        if (isFileField(fieldDef)) {
          // An upload cannot be prefilled - a re-shown modal starts empty.
          const upload = new FileUploadBuilder().setCustomId(customId).setRequired(fieldDef.required ?? true);
          if (fieldDef.minFiles != null) upload.setMinValues(fieldDef.minFiles);
          if (fieldDef.maxFiles != null) upload.setMaxValues(fieldDef.maxFiles);
          label.setFileUploadComponent(upload);
        } else if (isSelectField(fieldDef)) {
          const menu = new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setRequired(fieldDef.required ?? true)
            .addOptions(overrides?.options?.[customId] ?? fieldDef.options ?? []);
          if (fieldDef.placeholder) menu.setPlaceholder(fieldDef.placeholder);
          if (fieldDef.minValues != null) menu.setMinValues(fieldDef.minValues);
          if (fieldDef.maxValues != null) menu.setMaxValues(fieldDef.maxValues);
          label.setStringSelectMenuComponent(menu);
        } else {
          const input = new TextInputBuilder()
            .setCustomId(customId)
            .setStyle(fieldDef.style)
            .setRequired(fieldDef.required ?? true);
          if (fieldDef.maxLength != null) input.setMaxLength(fieldDef.maxLength);
          if (fieldDef.minLength != null) input.setMinLength(fieldDef.minLength);
          if (fieldDef.placeholder) input.setPlaceholder(fieldDef.placeholder);

          const val = overrides?.values?.[customId] ?? fieldDef.value;
          if (val != null) input.setValue(val);

          label.setTextInputComponent(input);
        }

        modalBuilder.addLabelComponents(label);
      }

      await interaction.showModal(modalBuilder);
    };

    const handler: InteractionHandler<S> = async (interaction, ctx) => {
      if (!interaction.isModalSubmit()) return;

      const values: Record<string, FieldValue> = {};
      for (const [key, fieldDef] of Object.entries(resolveFields(fields, ctx))) {
        if (isFileField(fieldDef)) {
          const uploads = interaction.fields.getUploadedFiles(key, false);
          values[key] = uploads
            ? [...uploads.values()].map((file) => ({
                name: file.name,
                url: file.url,
                size: file.size,
                contentType: file.contentType,
              }))
            : [];
        } else if (isSelectField(fieldDef)) {
          values[key] = [...interaction.fields.getStringSelectValues(key)];
        } else {
          values[key] = interaction.fields.getTextInputValue(key);
        }
      }

      return onSubmit(values as ValuesOf<FieldsOf<Src>>, interaction, ctx);
    };

    return {
      show,
      interactions: { [submitAction]: handler } as Record<string, InteractionHandler<S>>,
    };
  };
