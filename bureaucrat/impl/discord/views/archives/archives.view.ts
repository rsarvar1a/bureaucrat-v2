import { ButtonStyle, ChannelType } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import {
  button,
  buttonRow,
  channelSelect,
  channelSelectRow,
  linear,
  separator,
  text,
  v2,
} from '../../../../engine/discord/elements';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';

type ArchivesState = Record<string, never>;

const dismiss = dismissButton<ArchivesState>()({ action: 'dismiss' });

/**
 * The server's default archive, from `/archives manage`: one category select,
 * and whether ended games are copied offsite without being asked.
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
  guards: { '*': [inGuild], default: [can(Permissions.Server.Manage)], auto: [can(Permissions.Server.Manage)] },

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
            "the queue's own if it names one, otherwise this default. A full category rolls over: " +
            '**Archives** becomes **Archives 1**, **Archives 2** goes above it and takes over here. ' +
            '`/archives reflow` puts every archived game in date order across the chain.\n' +
            (settings.archive === null ? '-# No default archive yet.' : `-# Default archive: <#${settings.archive}>`),
        ),
        separator(),
        channelSelectRow(menu),
        separator(),
        text(
          'A server named by `/archives offsite config` can take a copy of every game as it ends, ' +
            'or only when `/game offsite` or `/archives offsite sync` asks.\n' +
            (settings.offsiteGuild === null
              ? '-# No archive server yet.'
              : `-# Archive server: ${settings.offsiteGuild}`),
        ),
        buttonRow(
          button(
            view.customId('auto'),
            `Offsite copy · ${settings.offsiteAuto ? 'as games end' : 'on request'}`,
            settings.offsiteAuto ? ButtonStyle.Success : ButtonStyle.Secondary,
          ),
        ),
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

    auto: async (interaction, ctx) => {
      await interaction.deferUpdate();
      if (ctx.view.entityId !== interaction.guildId) return { action: 'render' };

      const settings = await getOrCreateGuildSettings(BigInt(interaction.guildId!));
      await updateGuildSettings(BigInt(interaction.guildId!), { offsiteAuto: !settings.offsiteAuto });
      return { action: 'render' };
    },
  },
});
