import { SlashCommandBooleanOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getOrCreateGameSettings } from '../../../../drizzle/game-settings';
import { spawnByRoute } from '../../games/create';
import { whisperContext } from './context';
import { S } from '../../../../strings';

// A slash command takes one user per option, so the players are picked from
// an ephemeral select instead.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Invite several players to one whisper, when the Storytellers allow it.')
  .withOption(new Option('async', SlashCommandBooleanOption).describe('Take it from the asynchronous allowance'))
  .define(async (interaction, params) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const settings = await getOrCreateGameSettings(found.game.id);
    if (!settings.groupWhispers) {
      await toast.ephemeral(interaction, S.errors.whisperRefused['no-group'], { accent: accent.warning });
      return;
    }

    await spawnByRoute(
      'gwhispergroup',
      { interaction },
      { entityId: found.game.id, visibility: 'ephemeral', state: { async: params.async ?? false } },
    );
  });
