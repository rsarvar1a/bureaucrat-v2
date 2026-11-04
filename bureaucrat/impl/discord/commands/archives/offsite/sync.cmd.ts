import { ChannelType, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getExportOfGame, listCopiedExportsMissingPrivate, updateExport } from '../../../../../drizzle/game-exports';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../../drizzle/guild-settings';
import { listQueueArchives } from '../../../../../drizzle/queues';
import { actorOf } from '../../../access';
import { chainOf } from '../../../games/archives/categories';
import { gameOfChannel } from '../../../games/offsite/adopt';
import { placeOffsiteCard, startExport } from '../../../games/offsite/start';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/**
 * Every channel in every archive on this server that the archive server
 * does not have yet, queued for copying: a channel the record does not know
 * is adopted first, one whose copy failed or stopped halfway is resumed, one
 * copied without its private threads is sent back for them if the server
 * now wants them, and one complete is left alone. The offsite engine reflows the archive
 * server once the queue drains. Gated on `server.manage` at the gate.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Copy every archived game the archive server is missing, then reflow it.')
  .define(async (interaction) => {
    const actor = actorOf(interaction);
    const guild = interaction.guild;
    if (actor === null || !guild) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guildId = BigInt(guild.id);
    const destination = await destinationOf(interaction.client, guildId);
    if (!destination.ok) {
      const message =
        destination.reason === 'noOffsite' ? S.errors.noOffsite : S.errors.offsiteNotReachable(destination.missing);
      await toast.ephemeral(interaction, message, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }

    const settings = await getOrCreateGuildSettings(guildId);
    const roots = [settings.archive, ...(await listQueueArchives(guildId)).map((q) => q.archive!)].filter(
      (c): c is bigint => c !== null,
    );
    if (roots.length === 0) {
      await toast.ephemeral(interaction, S.errors.noArchive, { accent: accent.warning });
      return;
    }

    // Every text channel across every chain, each once however many settings point into it.
    const seen = new Set<string>();
    const channels = [];
    for (const root of roots) {
      const chain = await chainOf(guild, root);
      if (!chain) continue;
      for (const link of chain.links) {
        for (const channel of link.item.children.cache.values()) {
          if (channel.type !== ChannelType.GuildText || seen.has(channel.id)) continue;
          seen.add(channel.id);
          channels.push(channel);
        }
      }
    }

    // A finished copy that left its private threads out is owed them once the server wants them.
    const owedPrivate = new Set(
      settings.offsitePrivate ? (await listCopiedExportsMissingPrivate(guildId)).map((exp) => exp.id) : [],
    );

    const tally = { started: 0, adopted: 0, copied: 0, skipped: 0 };
    for (const channel of channels) {
      const found = await gameOfChannel(channel, guildId, actor.id);
      if (found.game === null) {
        tally.skipped += 1;
        continue;
      }
      const exp = await getExportOfGame(found.game.id);
      if (exp?.state === 'copied' && !owedPrivate.has(exp.id)) {
        tally.copied += 1;
        continue;
      }
      if (exp?.state === 'copied') {
        await updateExport(exp.id, { state: 'copying', copy: true, error: null });
      } else {
        const result = await startExport(found.game, { copy: true, fresh: false });
        if (!result.ok) {
          tally.skipped += 1;
          continue;
        }
      }
      await placeOffsiteCard(interaction.client, found.game);
      tally.started += 1;
      if (found.adopted) tally.adopted += 1;
    }

    // The reflow waits for the queue to drain; the engine does it (`offsite/engine.ts`).
    await updateGuildSettings(guildId, { offsiteReflowPending: true });

    await toast.ephemeral(interaction, S.offsite.synced(tally), { accent: accent.success, timeoutMs: 20_000 });
  });
