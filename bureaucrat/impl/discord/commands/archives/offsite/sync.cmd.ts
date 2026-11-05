import { ChannelType, MessageFlags, SlashCommandSubcommandBuilder, type TextChannel } from 'discord.js';
import { Superbuilder } from '../../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getExportOf, listCopiedExportsOwedPrivate } from '../../../../../drizzle/game-exports';
import { getOrCreateGuildSettings } from '../../../../../drizzle/guild-settings';
import { getDestination, updateDestination } from '../../../../../drizzle/offsite';
import { listQueueArchives } from '../../../../../drizzle/queues';
import { actorOf } from '../../../access';
import { chainOf } from '../../../games/archives/categories';
import { gameOfChannel } from '../../../games/offsite/adopt';
import { overlaps } from '../../../games/offsite/families';
import { resolveSources } from '../../../games/offsite/mappings';
import { placeOffsiteCard, sendBackForPrivate, startExport } from '../../../games/offsite/start';
import { destinationOf } from '../../../games/offsite/write';
import { S } from '../../../../../strings';

/**
 * Every channel in every mapped archive on this server that its off-server
 * archive does not have yet, queued for copying there: a channel the record
 * does not know is adopted first, one whose copy failed or stopped halfway
 * is resumed, one copied without its private threads is sent back for them
 * if the server now wants them, and one complete is left alone. Each
 * destination is reflowed by the offsite engine once the queue drains.
 * Archives with no mapping are counted, not copied. Gated on
 * `server.manage` at the gate.
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
    const families = (await resolveSources(guild)).filter((family) => family.base !== null);
    if (families.length === 0) {
      await toast.ephemeral(interaction, S.errors.noOffsite, { accent: accent.warning, timeoutMs: 15_000 });
      return;
    }

    // Every text channel across every mapped chain, each once, with where it goes.
    const seen = new Set<string>();
    const work: { channel: TextChannel; destination: string }[] = [];
    const problems: string[] = [];
    for (const family of families) {
      const row = await getDestination(family.source.destination);
      const check = await destinationOf(interaction.client, row);
      if (!check.ok) {
        problems.push(
          `**${family.base}**: ${check.reason === 'noOffsite' ? S.errors.archiveGone : S.errors.offsiteNotReachable(check.missing)}`,
        );
        continue;
      }
      const chain = await chainOf(guild, family.source.category);
      for (const link of chain?.links ?? []) {
        for (const channel of link.item.children.cache.values()) {
          if (channel.type !== ChannelType.GuildText || seen.has(channel.id)) continue;
          seen.add(channel.id);
          work.push({ channel, destination: family.source.destination });
        }
      }
    }

    // The archives games are filed into that no mapping covers: said, so a forgotten one is noticed.
    const settings = await getOrCreateGuildSettings(guildId);
    const roots = [settings.archive, ...(await listQueueArchives(guildId)).map((q) => q.archive)].filter(
      (c): c is bigint => c !== null,
    );
    let unmapped = 0;
    const counted = new Set<string>();
    for (const root of roots) {
      const chain = await chainOf(guild, root);
      if (!chain || counted.has(chain.base)) continue;
      counted.add(chain.base);
      if (
        !overlaps(
          families,
          chain.links.map((link) => link.item.id),
        )
      )
        unmapped += 1;
    }

    // A finished copy that left its private threads out is owed them once the server wants them.
    const owedPrivate = new Set(
      settings.offsitePrivate ? (await listCopiedExportsOwedPrivate(guildId)).map((exp) => exp.id) : [],
    );

    const tally = { started: 0, adopted: 0, copied: 0, skipped: 0, unmapped };
    const touched = new Set<string>();
    for (const { channel, destination } of work) {
      const found = await gameOfChannel(channel, guildId, actor.id);
      if (found.game === null) {
        tally.skipped += 1;
        continue;
      }
      touched.add(destination);
      const exp = await getExportOf(found.game.id, destination);
      if (exp?.state === 'copied' && !owedPrivate.has(exp.id)) {
        tally.copied += 1;
        continue;
      }
      if (exp?.state === 'copied') {
        await sendBackForPrivate(exp);
      } else {
        const result = await startExport(found.game, { copy: true, fresh: false, destination });
        if (!result.ok) {
          tally.skipped += 1;
          continue;
        }
      }
      await placeOffsiteCard(interaction.client, found.game);
      tally.started += 1;
      if (found.adopted) tally.adopted += 1;
    }

    // The reflows wait for the queue to drain; the engine does them (`offsite/engine.ts`).
    for (const id of touched) await updateDestination(id, { reflowPending: true });

    await toast.ephemeral(interaction, [S.offsite.synced(tally), ...problems].join('\n'), {
      accent: problems.length > 0 ? accent.warning : accent.success,
      timeoutMs: 20_000,
    });
  });
