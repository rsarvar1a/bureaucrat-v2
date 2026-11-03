/* eslint-disable @typescript-eslint/no-empty-object-type */

import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type ChannelType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Expand } from '../../../../utilities/types';
import type { CommandDefinition, Completer } from '../loader/types';
import { optionMeta, type Adder, type Getter, type OptionBuilderClass, type OptionValueOf } from './types';

export class Option<N extends string, B extends OptionBuilderClass, R extends boolean = false> {
  option: InstanceType<B>;

  readonly adder: Adder;
  readonly getter: Getter;

  /** Set by `completes`; read by `Superbuilder.define` when it assembles the command. */
  completer: Completer | null = null;

  constructor(
    public name: N,
    Builder: B,
    public required: R = false as R,
  ) {
    const meta = optionMeta.get(Builder)!;
    this.adder = meta.adder;
    this.getter = meta.getter;
    this.option = new Builder() as InstanceType<B>;
    this.option.setName(name);
    this.option.setRequired(required);
  }

  describe(description: string): this {
    this.option.setDescription(description);
    return this;
  }

  /**
   * Fixed choices, rendered by Discord as a dropdown.
   *
   * Only string and number options can carry them; calling this on any other
   * kind is a content bug worth failing loudly on. Discord caps the list at
   * 25 - the caller curates, this does not truncate silently.
   */
  choices(...choices: { name: string; value: string | number }[]): this {
    if (!('setChoices' in this.option) || typeof this.option.setChoices !== 'function') {
      throw new Error(`Option "${this.name}" does not support choices.`);
    }

    (this.option.setChoices as (...values: { name: string; value: string | number }[]) => unknown)(...choices);
    return this;
  }

  /** Narrow a channel option to the kinds of channel it may name. */
  channelTypes(...types: ChannelType[]): this {
    if (!('addChannelTypes' in this.option) || typeof this.option.addChannelTypes !== 'function') {
      throw new Error(`Option "${this.name}" does not take channel types.`);
    }

    (this.option.addChannelTypes as (...types: ChannelType[]) => unknown)(...types);
    return this;
  }

  /**
   * Answer this option live, per keystroke, instead of with fixed choices.
   *
   * The two are mutually exclusive in Discord's own model, and that is the
   * point of reaching for this: `choices` caps at 25 and is baked into the
   * command at sync time, so a hundred puzzles arrive both truncated and
   * frozen. `/puzzles` used to carry the first twenty-five in registry order
   * and, while any guild was pre-season, none at all - which left a free-text
   * box that Discord's client helpfully fills with channels and emoji.
   *
   * The handler returns at most 25 suggestions and should be cheap: Discord
   * fires one of these per character typed.
   */
  completes(completer: Completer): this {
    if (!('setAutocomplete' in this.option) || typeof this.option.setAutocomplete !== 'function') {
      throw new Error(`Option "${this.name}" does not support autocomplete.`);
    }

    (this.option.setAutocomplete as (value: boolean) => unknown)(true);
    this.completer = completer;

    return this;
  }
}

type Augment<N extends string, B extends OptionBuilderClass, R extends boolean> = R extends true
  ? { [k in N]: OptionValueOf<B> }
  : { [k in N]?: NonNullable<OptionValueOf<B>> };

export class Superbuilder<S extends SlashCommandBuilder | SlashCommandSubcommandBuilder, P = {}> {
  private _options: Array<{ name: string; getter: Getter; required: boolean }> = [];
  private _completers = new Map<string, Completer>();

  constructor(public spec: S) {}

  withOption<N extends string, B extends OptionBuilderClass>(
    option: Option<N, B, true>,
  ): Superbuilder<S, Expand<P & Augment<N, B, true>>>;

  withOption<N extends string, B extends OptionBuilderClass>(
    option: Option<N, B, false>,
  ): Superbuilder<S, Expand<P & Augment<N, B, false>>>;

  withOption<N extends string, B extends OptionBuilderClass, R extends boolean>(
    option: Option<N, B, R>,
  ): Superbuilder<S, Expand<P & Augment<N, B, R>>> {
    (this.spec[option.adder] as (option: InstanceType<B>) => S)(option.option);
    this._options.push({ name: option.name, getter: option.getter, required: option.required });
    if (option.completer) this._completers.set(option.name, option.completer);
    return this as Superbuilder<S, Expand<P & Augment<N, B, R>>>;
  }

  describe(description: string): this {
    this.spec.setDescription(description);
    return this;
  }

  define(
    handler: (interaction: ChatInputCommandInteraction, params: Expand<P>) => void | Promise<void>,
  ): CommandDefinition {
    const options = this._options;
    const completers = this._completers;

    return {
      spec: this.spec,
      // Only when something actually completes, so the router can tell a
      // command with no suggestions from one whose suggester threw.
      complete:
        completers.size === 0
          ? undefined
          : async (interaction, focused) => {
              const completer = completers.get(focused.name);

              return completer ? completer(interaction, focused) : [];
            },
      func: async (interaction) => {
        const params: Record<string, unknown> = {};
        for (const opt of options) {
          const value = (interaction.options[opt.getter] as (name: string, required: boolean) => unknown)(
            opt.name,
            opt.required,
          );
          params[opt.name] = opt.required ? value : (value ?? undefined);
        }
        await handler(interaction, params as Expand<P>);
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const noop = async (_interaction: ChatInputCommandInteraction) => {};
