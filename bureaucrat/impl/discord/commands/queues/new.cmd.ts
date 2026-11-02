import {
  ChannelType,
  MessageFlags,
  SlashCommandChannelOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  type TextChannel,
} from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { spawnView } from '../../../../engine/discord/views/lifecycle';
import { viewDefinitions } from '../../registry/views';
import { insertQueue } from '../../../../drizzle/queues';
import { toast } from '../../../../engine/discord/reply';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Create a new storyteller queue.')
  .withOption(new Option('name', SlashCommandStringOption, true).describe('Name of the queue'))
  .withOption(new Option('channel', SlashCommandChannelOption).describe('Channel to post the queue in'))
  .withOption(
    new Option('category', SlashCommandChannelOption)
      .describe("Category its games are created in (default: the queue channel's)")
      .channelTypes(ChannelType.GuildCategory),
  )
  .define(async (interaction, params) => {
    const guild = interaction.guildId;
    if (!guild) {
      await interaction.reply({ content: 'This command must be used in a server.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const targetChannel = (params.channel ?? interaction.channel) as TextChannel | null;
    if (!targetChannel || !('send' in targetChannel)) {
      await interaction.reply({ content: 'Invalid target channel.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Editable later from the queue's Category tab; this is only a sensible start.
    const inherited = 'parentId' in targetChannel ? targetChannel.parentId : null;
    const categoryId = params.category?.id ?? inherited;

    const queue = await insertQueue({
      name: params.name,
      guild: BigInt(guild),
      category: categoryId ? BigInt(categoryId) : null,
    });

    const viewDef = viewDefinitions.get('queue')!;

    await spawnView(viewDef, { interaction, channel: targetChannel }, { entityId: queue.id });

    await toast.ephemeral(interaction, `Queue **${params.name}** created!`);
  });
