import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export const text = (content: string) => new TextDisplayBuilder().setContent(content);

export const separator = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);

export const container = () => new ContainerBuilder();

export const buttonRow = (...buttons: ButtonBuilder[]) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

export const selectRow = (menu: StringSelectMenuBuilder) =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

export const button = (customId: string, label: string, style: ButtonStyle) =>
  new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);

export const select = (customId: string, placeholder: string) =>
  new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

type ContainerChild =
  | TextDisplayBuilder
  | SeparatorBuilder
  | ActionRowBuilder<MessageActionRowComponentBuilder>
  | SectionBuilder
  | MediaGalleryBuilder
  | FileBuilder;

export const linear = (...components: ContainerChild[]) => {
  const c = new ContainerBuilder();
  for (const component of components) {
    if (component instanceof TextDisplayBuilder) c.addTextDisplayComponents(component);
    else if (component instanceof SeparatorBuilder) c.addSeparatorComponents(component);
    else if (component instanceof ActionRowBuilder) c.addActionRowComponents(component);
    else if (component instanceof SectionBuilder) c.addSectionComponents(component);
    else if (component instanceof MediaGalleryBuilder) c.addMediaGalleryComponents(component);
    else if (component instanceof FileBuilder) c.addFileComponents(component);
  }
  return c;
};

export const v2 = (...containers: ContainerBuilder[]) => ({
  components: containers,
  flags: MessageFlags.IsComponentsV2 as const,
});
