import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import { reminderContext } from './context';

/** The game's pending reminders, with Cancel, in an ephemeral pane (`greminders`). */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe("List this game's pending reminders, and cancel one.")
  .define(async (interaction) => {
    const game = await reminderContext(interaction);
    if (!game) return;

    await spawnByRoute(
      'greminders',
      { interaction },
      { entityId: game.id, ids: { gconfig: game.id }, visibility: 'ephemeral', state: { selected: null } },
    );
  });
