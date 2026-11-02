import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from 'discord.js';

export type Spec = SlashCommandBuilder | SlashCommandSubcommandGroupBuilder | SlashCommandSubcommandBuilder;

/** One row of a dropdown. Discord takes at most 25 of them per response. */
export type Suggestion = { name: string; value: string | number };

/**
 * What to offer while somebody is still typing an option.
 *
 * Takes the focused option rather than reading it back off the interaction, so
 * a completer is a pure-ish function of "which option, and what have they typed
 * so far" and can be tested as one.
 */
export type Completer = (
  interaction: AutocompleteInteraction,
  focused: { name: string; value: string },
) => Suggestion[] | Promise<Suggestion[]>;

export type CommandDefinition = {
  spec: Spec;
  func: (interaction: ChatInputCommandInteraction) => void | Promise<void>;

  /**
   * Present only when some option of this command completes.
   *
   * Static `choices` cap at 25 and are baked into the command at sync time,
   * which is fine for a fixed handful and useless for a hundred puzzles: the
   * list is both truncated and frozen. An option that completes is answered
   * live, per keystroke, by the bot.
   */
  complete?: Completer;
};

export type CommandProvidingModule = { default: CommandDefinition };

export type ResolvedCommandDefinition = CommandDefinition & { path: string };
