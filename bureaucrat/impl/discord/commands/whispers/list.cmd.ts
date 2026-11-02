import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { text, linear, v2 } from '../../../../engine/discord/elements';
import { listOpenWhispersOf } from '../../../../drizzle/whispers';
import { displayNames } from '../../views/queue/members';
import { whisperContext } from './context';
import { S } from '../../../../strings';

// Private threads name their members by display name rather than mention, so
// the list cannot pull anyone into anything.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('The whispers you are in, oldest first.')
  .define(async (interaction) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const whispers = await listOpenWhispersOf(found.game.id, found.me.id);
    if (whispers.length === 0) {
      await interaction.editReply(v2(linear(text(S.whispers.none))));
      return;
    }

    const names = await displayNames(
      interaction.client,
      found.game.guild,
      whispers.flatMap((w) => w.members.map((m) => m.participant.member)),
    );
    const lines = whispers.map((w) => {
      const others = w.members
        .filter((m) => m.participant.id !== found.me.id)
        .map((m) => `**${names[String(m.participant.member)] ?? m.participant.member}**`);
      return `- <#${w.thread.thread}> · ${others.join(', ')}${w.whisper.async ? ' *(async)*' : ''}${w.whisper.free ? ' *(neighbour)*' : ''}`;
    });

    await interaction.editReply(v2(linear(text('### Your whispers'), text(lines.join('\n')))));
  });
