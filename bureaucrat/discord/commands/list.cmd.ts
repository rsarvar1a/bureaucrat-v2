import { SlashCommandBuilder } from 'discord.js';
import { Superbuilder } from '../frameworks/commands/builders/superbuilder';
import { spawnView } from '../frameworks/views/lifecycle';
import { viewDefinitions } from '../views';

export default new Superbuilder(new SlashCommandBuilder())
  .describe('Spawns a list view demo.')
  .define(async (interaction) => {
    const viewDef = viewDefinitions.get('list')!;
    await spawnView(viewDef, { interaction });
  });
