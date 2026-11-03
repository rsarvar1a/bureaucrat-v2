import { SlashCommandStringOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { writable } from '../../../../engine/discord/views/threads';
import { getManagedThreadBySnowflake } from '../../../../drizzle/managed-threads';
import { listThreadMembers } from '../../../../drizzle/managed-thread-participants';
import { getLatestWhisperOfThread } from '../../../../drizzle/whispers';
import { renamedWhisperThread } from '../../games/whispers/rules';
import { whisperContext } from './context';
import { S } from '../../../../strings';

// Membership is the thread's, not the day's whisper's, so a neighbours'
// standing thread can be retitled between whispers too.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Give this whisper thread a better title.')
  .withOption(new Option('title', SlashCommandStringOption, true).describe('The new title, after the Whisper mark'))
  .define(async (interaction, params) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const row = interaction.channelId ? await getManagedThreadBySnowflake(BigInt(interaction.channelId)) : undefined;
    const channel = interaction.channel;
    if (!row || row.kind !== 'whisper' || !channel?.isThread()) {
      await toast.ephemeral(interaction, S.errors.whisperRenameNotHere, { accent: accent.warning });
      return;
    }
    const members = await listThreadMembers(row.id);
    if (found.me.role === 'Player' && !members.some((m) => m.id === found.me.id)) {
      await toast.ephemeral(interaction, S.errors.whisperNotYours, { accent: accent.warning });
      return;
    }

    const latest = await getLatestWhisperOfThread(row.id);
    const name = renamedWhisperThread(latest?.free ?? false, params.title);
    await writable(channel);
    await channel.setName(name, `Renamed by ${interaction.user.tag}`);
    await toast.ephemeral(interaction, S.whispers.renamed(name), { accent: accent.success });
  });
