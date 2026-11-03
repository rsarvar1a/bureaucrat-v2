import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MentionableSelectMenuBuilder,
  ComponentType,
  RoleSelectMenuBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
  type APIEmbed,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

/**
 * Re-exported so a view can compose from the toolkit rather than reaching past
 * it into the library underneath.
 */
export { ButtonStyle } from 'discord.js';

/**
 * Container accent colours. Components V2 has no embed colour, so the accent
 * stripe is the only tone a container carries.
 */
export const accent = {
  brand: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  neutral: 0x4f545c,
} as const;

export const text = (content: string) => new TextDisplayBuilder().setContent(content);

export const separator = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);

export const container = () => new ContainerBuilder();

/**
 * A text block with an image floated beside it. The URL is usually
 * `attachment://<name>`, referring to a file shipped on the same message.
 */
export const withThumbnail = (url: string, ...content: TextDisplayBuilder[]) =>
  new SectionBuilder().addTextDisplayComponents(...content).setThumbnailAccessory(new ThumbnailBuilder().setURL(url));

/**
 * A full-width image inside a container.
 *
 * Attaching a file is not enough under Components V2 - an attachment that no
 * component references simply does not render. This is what puts it on screen.
 */
export const media = (url: string, alt?: string) => {
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (alt) item.setDescription(alt);

  return new MediaGalleryBuilder().addItems(item);
};

/**
 * A downloadable file card inside a container - the non-image counterpart
 * to `media`, for documents such as PDFs. The same attachment rule applies:
 * the file must ride the message and be referenced to render.
 */
export const file = (url: string) => new FileBuilder().setURL(url);

/**
 * Whether an element is the file card for a given attachment URL - how a
 * view detects that a render has already placed the card itself.
 */
export const isFile = (el: unknown, url: string): boolean => el instanceof FileBuilder && el.toJSON().file?.url === url;

/**
 * A classic embed - what a non-Components-V2 message uses in place of a container.
 *
 * The two rendering modes are mutually exclusive and each gives up something.
 * V2 has containers, separators and media galleries, but forbids `content` and
 * `embeds`, and every attachment must be referenced by a component - so files
 * arrive as download cards and Discord's own preview never runs. Classic keeps
 * the native preview (a .txt inline, an image embedded) and still has real
 * interactive components in action rows, but its only styled block is this.
 *
 * So: a view that needs the file preview renders classic, and puts the framing
 * that would have been a container in here. The accent colours in `accent` work
 * as `colour` - an embed's stripe is the same tone the container would have had.
 */
export const embed = (parts: { title?: string; description?: string; colour?: number }): APIEmbed => ({
  ...(parts.title ? { title: parts.title } : {}),
  ...(parts.description ? { description: parts.description } : {}),
  ...(parts.colour !== undefined ? { color: parts.colour } : {}),
});

/**
 * Reduce a block of container children to what a CLASSIC (non-Components-V2)
 * message can carry: markdown for `content`, and action rows for `components`.
 *
 * Why a view would want this: Components V2 suppresses Discord's own attachment
 * rendering. Under V2 a file only appears through a `file` component, which is a
 * download card - the client's built-in preview (a .txt shown inline, an image
 * embedded) never runs. A view that wants that preview has to render classic,
 * and this lets it reuse blocks already built from `text` and `buttonRow`
 * instead of maintaining a second copy of them.
 *
 * V2-only chrome - separators, media galleries, file cards - has no classic
 * equivalent and is dropped rather than approximated.
 *
 * Note that a message cannot change its mind: Discord does not allow the
 * Components V2 flag to be added to, or removed from, an existing message on
 * edit. A view that renders classic must do so on every render, not just some.
 */
export const classic = (block: unknown[]) => {
  const lines: string[] = [];
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const element of block) {
    const json = (element as { toJSON?: () => { type?: number; content?: string } })?.toJSON?.();
    if (json?.type === ComponentType.TextDisplay) {
      if (json.content) lines.push(json.content);
    } else if (json?.type === ComponentType.ActionRow) {
      rows.push(element as ActionRowBuilder<MessageActionRowComponentBuilder>);
    }
  }

  return { content: lines.join('\n'), rows };
};

export const buttonRow = (...buttons: ButtonBuilder[]) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

export const selectRow = (menu: StringSelectMenuBuilder) =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

export const userSelectRow = (menu: UserSelectMenuBuilder) =>
  new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu);

export const channelSelectRow = (menu: ChannelSelectMenuBuilder) =>
  new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);

export const roleSelectRow = (menu: RoleSelectMenuBuilder) =>
  new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);

export const mentionableSelectRow = (menu: MentionableSelectMenuBuilder) =>
  new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(menu);

export const button = (customId: string, label: string, style: ButtonStyle) =>
  new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);

/**
 * A labelless, emoji-only button. Discord renders these as compact squares,
 * which is what makes tight clusters (d-pads, keypads) look like one control
 * instead of rows of pills.
 */
export const emojiButton = (customId: string, emoji: string, style: ButtonStyle) =>
  new ButtonBuilder().setCustomId(customId).setEmoji(emoji).setStyle(style);

/** A button that opens a URL. Link buttons carry no custom id and never dispatch. */
export const linkButton = (label: string, url: string) =>
  new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);

export const select = (customId: string, placeholder: string) =>
  new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

export const userSelect = (customId: string, placeholder: string) =>
  new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

export const channelSelect = (customId: string, placeholder: string) =>
  new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

export const roleSelect = (customId: string, placeholder: string) =>
  new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

/** A select that offers both roles and members; the handler checks `interaction.roles` to tell which arrived. */
export const mentionableSelect = (customId: string, placeholder: string) =>
  new MentionableSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

export type ContainerChild =
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
