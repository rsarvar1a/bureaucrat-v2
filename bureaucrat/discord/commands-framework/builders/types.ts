import type { Superbuilder } from './superbuilder';

import {
  Attachment,
  GuildMember,
  Role,
  User,
  SlashCommandAttachmentOption,
  SlashCommandBooleanOption,
  SlashCommandBuilder,
  SlashCommandChannelOption,
  SlashCommandIntegerOption,
  SlashCommandMentionableOption,
  SlashCommandNumberOption,
  SlashCommandRoleOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  SlashCommandUserOption,
  type APIInteractionDataResolvedChannel,
  type APIInteractionDataResolvedGuildMember,
  type APIRole,
  type APIUser,
  type GuildBasedChannel,
} from 'discord.js';

export type OptionBuilderClass =
  | typeof SlashCommandAttachmentOption
  | typeof SlashCommandBooleanOption
  | typeof SlashCommandChannelOption
  | typeof SlashCommandIntegerOption
  | typeof SlashCommandMentionableOption
  | typeof SlashCommandNumberOption
  | typeof SlashCommandRoleOption
  | typeof SlashCommandStringOption
  | typeof SlashCommandUserOption;

export type OptionValueOf<B> = B extends typeof SlashCommandAttachmentOption
  ? Attachment
  : B extends typeof SlashCommandBooleanOption
    ? boolean
    : B extends typeof SlashCommandChannelOption
      ? GuildBasedChannel | APIInteractionDataResolvedChannel
      : B extends typeof SlashCommandIntegerOption
        ? number
        : B extends typeof SlashCommandMentionableOption
          ? GuildMember | APIInteractionDataResolvedGuildMember | Role | APIRole | User | APIUser
          : B extends typeof SlashCommandNumberOption
            ? number
            : B extends typeof SlashCommandRoleOption
              ? Role | APIRole
              : B extends typeof SlashCommandStringOption
                ? string
                : B extends typeof SlashCommandUserOption
                  ? User | APIUser
                  : never;

export type Adder =
  | 'addAttachmentOption'
  | 'addBooleanOption'
  | 'addChannelOption'
  | 'addIntegerOption'
  | 'addMentionableOption'
  | 'addNumberOption'
  | 'addRoleOption'
  | 'addStringOption'
  | 'addUserOption';

export type Getter =
  | 'getAttachment'
  | 'getBoolean'
  | 'getChannel'
  | 'getInteger'
  | 'getMentionable'
  | 'getNumber'
  | 'getRole'
  | 'getString'
  | 'getUser';

export const optionMeta = new Map<OptionBuilderClass, { adder: Adder; getter: Getter }>([
  [SlashCommandAttachmentOption, { adder: 'addAttachmentOption', getter: 'getAttachment' }],
  [SlashCommandBooleanOption, { adder: 'addBooleanOption', getter: 'getBoolean' }],
  [SlashCommandChannelOption, { adder: 'addChannelOption', getter: 'getChannel' }],
  [SlashCommandIntegerOption, { adder: 'addIntegerOption', getter: 'getInteger' }],
  [SlashCommandMentionableOption, { adder: 'addMentionableOption', getter: 'getMentionable' }],
  [SlashCommandNumberOption, { adder: 'addNumberOption', getter: 'getNumber' }],
  [SlashCommandRoleOption, { adder: 'addRoleOption', getter: 'getRole' }],
  [SlashCommandStringOption, { adder: 'addStringOption', getter: 'getString' }],
  [SlashCommandUserOption, { adder: 'addUserOption', getter: 'getUser' }],
]);

/**
 * Extract the accumulated params type from a Superbuilder instance.
 */
export type InferParams<B> = B extends Superbuilder<SlashCommandBuilder | SlashCommandSubcommandBuilder, infer P> ? P : never;
