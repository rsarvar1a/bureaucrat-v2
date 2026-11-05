import { SlashCommandBooleanOption, SlashCommandSubcommandBuilder } from 'discord.js';
import { Option, Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { placeOffsiteCard, startExport } from '../../games/offsite/start';
import { destinationForGame } from '../../games/offsite/mappings';
import { destinationOf } from '../../games/offsite/write';
import { endedGameContext } from './context';
import { S } from '../../../../strings';

const REFUSALS = { running: S.errors.exportRunning, done: S.errors.exportDone, nothing: S.errors.nothingExported };

/**
 * Copies the ended game into the archive server: read first if it has not
 * been, then replayed thread by thread. Hours for a long game; the card in
 * the channel follows along and the job survives a restart.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Copy this ended game into the archive server.')
  .withOption(new Option('fresh', SlashCommandBooleanOption).describe('Throw away an earlier copy and start over'))
  .define(async (interaction, params) => {
    const ctx = await endedGameContext(interaction);
    if (!ctx) return;

    // Checked now, so a missing permission is seen before an hour of work rather than after.
    const row = await destinationForGame(interaction.client, ctx.game);
    if (!row) {
      await toast.ephemeral(interaction, S.errors.notMapped, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }
    const destination = await destinationOf(interaction.client, row);
    if (!destination.ok) {
      const message =
        destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing);
      await toast.ephemeral(interaction, message, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }

    const result = await startExport(ctx.game, { copy: true, fresh: params.fresh ?? false, destination: row.id });
    if (!result.ok) {
      await toast.ephemeral(interaction, REFUSALS[result.reason], { accent: accent.neutral });
      return;
    }
    await placeOffsiteCard(interaction.client, ctx.game);
    await toast.ephemeral(interaction, S.offsite.started(ctx.game.name), { accent: accent.success, timeoutMs: 10_000 });
  });
