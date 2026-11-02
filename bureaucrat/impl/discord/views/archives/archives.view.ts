import { ChannelType } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { channelSelect, channelSelectRow, linear, separator, text, v2 } from '../../../../engine/discord/elements';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';

type ArchivesState = Record<string, never>;

const dismiss = dismissButton<ArchivesState>()({ action: 'dismiss' });

/**
 * The server's default archive, from `/archives manage`: one category select.
 * Bound to the guild (`entityId`), and the write goes to the guild the actor
 * was checked in, so a custom id carried over from another server changes
 * nothing there.
 */
export default createView<ArchivesState>()({
  id: 'archives',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: {},
  guards: { '*': [inGuild], default: [can(Permissions.Server.Manage)] },

  render: async (view) => {
    const settings = await getOrCreateGuildSettings(BigInt(view.entityId!));

    const menu = channelSelect(view.customId('default'), 'Choose the default archive')
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(0)
      .setMaxValues(1);
    if (settings.archive !== null) menu.setDefaultChannels(String(settings.archive));

    return v2(
      linear(
        text('### Archives'),
        text(
          'Once a game has ended, `/game archive` moves its channel to the top of an archive category: ' +
            "the queue's own if it names one, otherwise this default.\n" +
            (settings.archive === null ? '-# No default archive yet.' : `-# Default archive: <#${settings.archive}>`),
        ),
        separator(),
        channelSelectRow(menu),
        separator(),
        dismiss.row(view),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,

    default: async (interaction, ctx) => {
      if (!interaction.isChannelSelectMenu()) return;
      await interaction.deferUpdate();

      if (ctx.view.entityId !== interaction.guildId) return { action: 'render' };

      const chosen = interaction.values[0];
      await updateGuildSettings(BigInt(interaction.guildId!), { archive: chosen ? BigInt(chosen) : null });

      return { action: 'render' };
    },
  },
});
