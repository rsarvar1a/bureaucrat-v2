import { SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../frameworks/commands/builders/superbuilder';
import { spawnView } from '../frameworks/views/lifecycle';
import { viewDefinitions } from '../views';

export default new Superbuilder(new SlashCommandBuilder())
  .describe('Spawns a counter view.')
  .define(async (interaction) => {
    const viewDef = viewDefinitions.get('counter')!;
    await spawnView(viewDef, { interaction }, { visibility: 'ephemeral' });
  });
