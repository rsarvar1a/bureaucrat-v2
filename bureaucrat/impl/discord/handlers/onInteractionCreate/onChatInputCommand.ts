import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { commandHandlers } from '../../registry/commands';
import { logger } from '../../../../utilities/logger';
import { replySafely } from '../../../../engine/discord/reply';
import { accessAllows, actorOf } from '../../access';
import { commandAccess } from '../../guards/command-access';
import { S } from '../../../../strings';

/**
 * Whether this actor may run this command, in one place for every command.
 *
 * The view side gets the same decision through guard lists; commands have no
 * such slot, so this stands in for one. Failing closed matters here in a way
 * it does not for a view: `dispatch` already converts a throwing guard into a
 * refusal, and this is the equivalent promise for the command half.
 */
const denyReason = async (path: string, interaction: ChatInputCommandInteraction): Promise<string | null> => {
  const need = commandAccess(path);
  if (need === 'open') return null;

  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;

  const verdict = await accessAllows(BigInt(interaction.guildId!), actor, need);

  return verdict.ok ? null : verdict.reason;
};

const resolve = (interaction: ChatInputCommandInteraction): string => {
  const cmd = interaction.commandName;
  const subcmd = interaction.options.getSubcommand(false);
  const subcmdgroup = interaction.options.getSubcommandGroup(false);
  return [cmd, subcmdgroup, subcmd].filter(Boolean).join('::');
};

/** How old the interaction is by the host's clock; Discord gives three seconds to answer, and a wildly off clock shows here too. */
const ageOf = (interaction: ChatInputCommandInteraction): number => Date.now() - interaction.createdTimestamp;

export default async function onChatInputCommand(interaction: ChatInputCommandInteraction) {
  const path = resolve(interaction);
  const func = commandHandlers.get(path);

  // An interaction that is already old on arrival points at the gateway or
  // the box, not the handler; the number says which window was missed.
  const arrived = ageOf(interaction);
  if (arrived > 2_000 || arrived < 0) {
    logger.warn({ message: `Command ${path} reached the handler ${arrived}ms after Discord created it.` });
  }

  if (!func) {
    logger.error({ message: `No command handler found for path ${path}.` });
    await interaction.reply({
      content: S.common.commandFailedProcessing,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    // Before the handler, so nothing has replied or deferred yet and the
    // refusal is always a clean ephemeral. Inside the try, so a failure to
    // reach the policy refuses rather than admitting.
    const denial = await denyReason(path, interaction);
    if (denial !== null) {
      await replySafely(interaction, { content: denial, flags: [MessageFlags.Ephemeral] });
      return;
    }

    await func(interaction);
  } catch (error) {
    logger.error({
      message: `Encountered error in command ${path} (${ageOf(interaction)}ms after it was created).`,
      error,
    });
    await replySafely(interaction, {
      content: S.common.commandFailedExecuting,
      flags: [MessageFlags.Ephemeral],
    });
  }
}
