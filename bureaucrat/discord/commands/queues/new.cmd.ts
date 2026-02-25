import {
  SlashCommandChannelOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  type TextChannel,
} from 'discord.js';
import { Option, Superbuilder } from '../../frameworks/commands/builders/superbuilder';
import { spawnView } from '../../frameworks/views/lifecycle';
import { viewDefinitions } from '../../views';
import { insertQueue } from '../../../drizzle/queues';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Create a new storyteller queue.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('Name of the queue'))
  .withOption(new Option('channel', SlashCommandChannelOption).describe('Channel to post the queue in'))
  .define(async (interaction, params) => {
    const guild = interaction.guildId;
    if (!guild) {
      await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
      return;
    }

    const targetChannel = (params.channel ?? interaction.channel) as TextChannel | null;
    if (!targetChannel || !('send' in targetChannel)) {
      await interaction.reply({ content: 'Invalid target channel.', ephemeral: true });
      return;
    }

    const categoryId = 'parentId' in targetChannel ? BigInt(targetChannel.parentId ?? '0') : 0n;

    const queue = await insertQueue({
      name: params.name,
      guild: BigInt(guild),
      category: categoryId,
    });

    const viewDef = viewDefinitions.get('queue')!;

    await spawnView(viewDef, { interaction, channel: targetChannel }, { entityId: queue.id });

    await interaction.reply({ content: `Queue **${params.name}** created!`, ephemeral: true });
  });
