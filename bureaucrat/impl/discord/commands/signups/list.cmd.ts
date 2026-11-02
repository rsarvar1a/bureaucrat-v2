import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnByRoute } from '../../games/create';
import { gameHere } from './here';

// The Members window's Peek, as a command: anyone in the channel (or one of
// its threads) sees who holds each role, as pings, in an ephemeral.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('See who is in this game, by role.')
  .define(async (interaction) => {
    const here = await gameHere(interaction);
    if (!here) return;

    const { game } = here;
    await spawnByRoute(
      'gpeek',
      { interaction },
      { entityId: game.id, ids: { gconfig: game.id }, visibility: 'ephemeral' },
    );
  });
