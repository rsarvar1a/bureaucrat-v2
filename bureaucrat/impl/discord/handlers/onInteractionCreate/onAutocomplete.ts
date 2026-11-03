import type { AutocompleteInteraction } from 'discord.js';
import { autocompleteHandlers } from '../../registry/commands';
import { logger } from '../../../../utilities/logger';

/** Discord's cap on a single autocomplete response. */
const LIMIT = 25;

/**
 * Answers an option that is still being typed.
 *
 * **Always responds, including on failure.** Discord gives roughly three
 * seconds and shows the user a spinner until something arrives; a handler that
 * throws and says nothing leaves the box hanging, which reads as the command
 * being broken rather than as one suggestion list going wrong. An empty list is
 * an honest "nothing matches" and costs nothing.
 *
 * No access check, deliberately, and it is worth saying why: a suggestion list
 * is not an action. The command's own `denyReason` still runs when they press
 * enter, so completing here can only ever save somebody typing something they
 * would then be refused. Anything a completer must not leak - unreleased puzzle
 * titles, say - is the completer's own business, because only it knows what it
 * is about to offer.
 */
const resolve = (interaction: AutocompleteInteraction): string => {
  const cmd = interaction.commandName;
  const subcmd = interaction.options.getSubcommand(false);
  const subcmdgroup = interaction.options.getSubcommandGroup(false);

  return [cmd, subcmdgroup, subcmd].filter(Boolean).join('::');
};

export default async function onAutocomplete(interaction: AutocompleteInteraction) {
  const path = resolve(interaction);
  const complete = autocompleteHandlers.get(path);

  if (!complete) {
    await interaction.respond([]);
    return;
  }

  try {
    const focused = interaction.options.getFocused(true);
    const suggestions = await complete(interaction, { name: focused.name, value: focused.value });

    await interaction.respond(suggestions.slice(0, LIMIT));
  } catch (error) {
    logger.error({ message: `Encountered error completing ${path}.`, error });
    await interaction.respond([]).catch(() => undefined);
  }
}
