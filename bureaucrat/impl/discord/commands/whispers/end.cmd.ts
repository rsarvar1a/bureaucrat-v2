import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { closeWhisper, endFor } from '../../games/whispers/close';
import { whisperContext, whisperHere } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Leave this whisper and speak in town again; a Storyteller closes it for everyone.')
  .define(async (interaction) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const whisper = await whisperHere(interaction);
    if (!whisper) {
      await toast.ephemeral(interaction, S.errors.whisperEnd['not-in-thread'], { accent: accent.warning });
      return;
    }

    if (found.me.role === 'Storyteller') {
      await closeWhisper(interaction.client, found.game, whisper, 'storyteller');
      await toast.ephemeral(interaction, S.whispers.closed, { accent: accent.success });
      return;
    }

    const result = await endFor(interaction.client, found.game, whisper, found.me);
    if (!result.ok) {
      await toast.ephemeral(interaction, S.errors.whisperEnd[result.reason], { accent: accent.warning });
      return;
    }
    await toast.ephemeral(interaction, result.closed ? S.whispers.closed : S.whispers.ended, {
      accent: accent.success,
    });
  });
