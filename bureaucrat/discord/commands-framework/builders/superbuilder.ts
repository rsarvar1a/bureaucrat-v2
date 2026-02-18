/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SlashCommandBuilder, SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Expand } from '../../../utilities/types';
import type { CommandDefinition } from '../loader/types';
import { optionMeta, type OptionBuilderClass, type OptionValueOf } from './types';

export class Option<N extends string, B extends OptionBuilderClass, R extends boolean = false> {
  option: InstanceType<B>;

  readonly adder: string;
  readonly getter: string;

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
    (this.option as any).setRequired(required);
  }

  describe(description: string): this {
    (this.option as any).setDescription(description);
    return this;
  }
}

export class Superbuilder<S extends SlashCommandBuilder | SlashCommandSubcommandBuilder, P = {}> {
  private _options: Array<{ name: string; getter: string; required: boolean }> = [];

  constructor(public spec: S) {}

  withOption<N extends string, B extends OptionBuilderClass>(option: Option<N, B, true>): Superbuilder<S, Expand<P & { [k in N]: OptionValueOf<B> }>>;

  withOption<N extends string, B extends OptionBuilderClass>(
    option: Option<N, B, false>,
  ): Superbuilder<S, Expand<P & { [k in N]?: NonNullable<OptionValueOf<B>> }>>;

  withOption<N extends string, B extends OptionBuilderClass, R extends boolean>(option: Option<N, B, R>): Superbuilder<S, any> {
    (this.spec as any)[option.adder](option.option);
    this._options.push({ name: option.name, getter: option.getter, required: option.required });
    return this as Superbuilder<S, any>;
  }

  describe(description: string): this {
    (this.spec as any).setDescription(description);
    return this;
  }

  define(handler: (interaction: ChatInputCommandInteraction, params: Expand<P>) => void | Promise<void>): CommandDefinition {
    const options = this._options;
    return {
      spec: this.spec,
      func: async (interaction) => {
        const params: Record<string, unknown> = {};
        for (const opt of options) {
          const value = (interaction.options as any)[opt.getter](opt.name, opt.required);
          params[opt.name] = opt.required ? value : (value ?? undefined);
        }
        await handler(interaction, params as Expand<P>);
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const noop = async (_interaction: ChatInputCommandInteraction) => {};
