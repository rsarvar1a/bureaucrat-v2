import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { syncApplicationEmojis, type SyncReport } from '../../games/emoji-sync';
import { logger } from '../../../../utilities/logger';

const describe = (report: SyncReport, done: boolean) =>
  `${done ? 'Done' : 'Working'}: ${report.uploaded} added, ${report.skipped} already there` +
  (report.failed.length > 0 ? `, ${report.failed.length} failed (${report.failed.slice(0, 10).join(', ')})` : '') +
  ` of ${report.total}.`;

// Hundreds of uploads, paced by the rate limiter: the reply is edited as it
// goes and once more at the end. The interaction token outlives a quarter of
// an hour of that; past it the edits fail quietly and the log has the report.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Load the official character icons and the Office emotes as application emoji.')
  .define(async (interaction) => {
    if (!interaction.client.isReady()) return;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const edit = async (content: string): Promise<void> => {
      try {
        await interaction.editReply(content);
      } catch (error) {
        logger.debug({ message: 'Emoji sync progress could not be shown.', error });
      }
    };

    try {
      const report = await syncApplicationEmojis(interaction.client, (progress) => edit(describe(progress, false)));
      logger.info({ message: `Application emoji sync: ${describe(report, true)}` });
      await edit(describe(report, true));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await edit(`The emoji sync failed: ${message}`);
    }
  });
