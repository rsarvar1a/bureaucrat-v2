import { SlashCommandBooleanOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { placeOffsiteCard, startExport } from '../../games/offsite/start';
import { endedGameContext } from './context';
import { S } from '../../../../strings';

const REFUSALS = { running: S.errors.exportRunning, done: S.errors.exportDone, nothing: S.errors.nothingExported };

/** Reads the ended game into the database, without copying it anywhere: the record, and the first half of `/game offsite`. */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Read this ended game, every thread included, into the record.')
  .withOption(new Option('fresh', SlashCommandBooleanOption).describe('Throw away an earlier export and read again'))
  .define(async (interaction, params) => {
    const ctx = await endedGameContext(interaction);
    if (!ctx) return;

    const result = await startExport(ctx.game, { copy: false, fresh: params.fresh ?? false });
    if (!result.ok) {
      await toast.ephemeral(interaction, REFUSALS[result.reason], { accent: accent.neutral });
      return;
    }
    await placeOffsiteCard(interaction.client, ctx.game);
    await toast.ephemeral(interaction, S.offsite.started(ctx.game.name), { accent: accent.success, timeoutMs: 10_000 });
  });
