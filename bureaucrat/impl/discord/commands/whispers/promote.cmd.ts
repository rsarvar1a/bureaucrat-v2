import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { askPromotion } from '../../games/whispers/close';
import { displayNames } from '../../views/queue/members';
import { whisperContext, whisperHere } from './context';
import { S } from '../../../../strings';

export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Ask everyone in this whisper to make it async, so you may all speak in town too.')
  .define(async (interaction) => {
    const found = await whisperContext(interaction);
    if (!found) return;

    const whisper = await whisperHere(interaction);
    if (!whisper) {
      await toast.ephemeral(interaction, S.errors.whisperPromote['not-in-thread'], { accent: accent.warning });
      return;
    }

    const asked = await askPromotion(interaction.client, { interaction }, found.game, whisper, found.me);
    if (asked.ok) {
      await toast.ephemeral(interaction, S.whispers.promoteAsked(asked.channel), { accent: accent.success });
      return;
    }
    if (asked.reason === 'over-budget') {
      const names = await displayNames(
        interaction.client,
        found.game.guild,
        asked.who.map((p) => p.member),
      );
      const who = asked.who.map((p) => `**${names[String(p.member)] ?? p.member}**`);
      await toast.ephemeral(interaction, S.errors.whisperPromoteBudget(who), { accent: accent.warning });
      return;
    }
    await toast.ephemeral(interaction, S.errors.whisperPromote[asked.reason], { accent: accent.warning });
  });
