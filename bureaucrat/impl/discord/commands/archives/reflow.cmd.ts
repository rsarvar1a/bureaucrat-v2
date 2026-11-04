import { MessageFlags, SlashCommandSubcommandBuilder, type CategoryChannel } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { listQueueArchives, updateQueue } from '../../../../drizzle/queues';
import { chainOf, reflowChain } from '../../games/archives/categories';
import { stampByRecord } from '../../games/archives/stamps';
import { S } from '../../../../strings';

type Pivot = (next: CategoryChannel) => Promise<void>;

/**
 * Puts every archived game on this server in date order across its chain:
 * the server's default archive and any queue's own, each chain once, the
 * settings following to the link new games should go to. Gated on
 * `server.manage` at the gate.
 */
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Reorder every archived game across the archive categories, newest first.')
  .define(async (interaction) => {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: S.errors.guildOnly, flags: [MessageFlags.Ephemeral] });
      return;
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const guildId = BigInt(guild.id);
    const settings = await getOrCreateGuildSettings(guildId);
    const filings: { category: bigint; pivot: Pivot }[] = [];
    if (settings.archive !== null) {
      filings.push({
        category: settings.archive,
        pivot: async (next) => {
          await updateGuildSettings(guildId, { archive: BigInt(next.id) });
        },
      });
    }
    for (const queue of await listQueueArchives(guildId)) {
      filings.push({
        category: queue.archive!,
        pivot: async (next) => {
          await updateQueue(queue.id, { archive: BigInt(next.id) });
        },
      });
    }
    if (filings.length === 0) {
      await toast.ephemeral(interaction, S.errors.noArchive, { accent: accent.warning });
      return;
    }

    // One reflow per chain, however many settings point into it.
    const chains = new Map<string, { category: bigint; pivots: Pivot[] }>();
    for (const filing of filings) {
      const chain = await chainOf(guild, filing.category);
      if (!chain) continue;
      const entry = chains.get(chain.base) ?? { category: filing.category, pivots: [] };
      entry.pivots.push(filing.pivot);
      chains.set(chain.base, entry);
    }

    const results: { base: string; channels: number; links: number }[] = [];
    for (const [base, { category, pivots }] of chains) {
      const done = await reflowChain(guild, category, stampByRecord);
      if (!done) continue;
      for (const pivot of pivots) await pivot(done.current);
      results.push({ base, channels: done.channels, links: done.chain.links.length });
    }
    if (results.length === 0) {
      await toast.ephemeral(interaction, S.errors.archiveGone, { accent: accent.warning });
      return;
    }

    await toast.ephemeral(interaction, S.offsite.reflowed(results), { accent: accent.success, timeoutMs: 15_000 });
  });
