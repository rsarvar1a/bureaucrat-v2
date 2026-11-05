import {
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuOptionBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { field, modal } from '../../../../../engine/discord/components/modal';
import {
  accent,
  button,
  buttonRow,
  channelSelect,
  channelSelectRow,
  linear,
  select,
  selectRow,
  separator,
  text,
  v2,
} from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { deleteSource, getDestination, getSource } from '../../../../../drizzle/offsite';
import { addMapping, retargetMapping, targetOf } from '../../../games/offsite/mappings';
import { destinationOf } from '../../../games/offsite/write';
import { Permissions } from '../../../../acl/permissions';
import { can, inGuild } from '../../../guards';
import { describeMappings, unmappedArchives } from './render';
import { S } from '../../../../../strings';

type OffsiteState = {
  /** The mapping the buttons act on. */
  selected?: string;
  /** The on-server category picked to map, waiting on the modal. */
  adding?: string;
  removing?: boolean;
};

const manages = [can(Permissions.Server.Manage)];

const dismiss = dismissButton<OffsiteState>()({ action: 'dismiss' });

/** Says what the bot is missing at a destination just saved, if anything; the mapping stands either way. */
const warnIfUnusable = async (interaction: ModalSubmitInteraction, destinationId: string) => {
  const check = await destinationOf(interaction.client, await getDestination(destinationId));
  if (!check.ok && check.reason === 'missing') {
    await toast.followUp(interaction, S.errors.offsiteNotReachable(check.missing), { accent: accent.warning });
  }
};

const targetModal = modal<OffsiteState>()({
  action: 'target',
  title: 'Off-server archive',
  fields: {
    guild: field.short('Server id', { placeholder: 'The archive server\'s ID', maxLength: 20 }),
    category: field.short('Category id', {
      placeholder: 'A category',
      maxLength: 20,
    }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    if (ctx.view.entityId !== interaction.guildId || !interaction.guild) return { action: 'render' };

    const target = await targetOf(interaction.client, values.guild.trim(), values.category.trim());
    if (!target) {
      await toast.followUp(interaction, S.errors.offsiteTargetBad, { accent: accent.warning });
      return { action: 'render' };
    }
    // Ids are public, so knowing them proves nothing: whoever points games at
    // a server must be able to manage that server too, or anyone running the
    // bot could fill someone else's archive.
    const member = await target.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await toast.followUp(interaction, S.errors.offsiteNotManager(target.guild.name), { accent: accent.warning });
      return { action: 'render' };
    }

    const { adding, selected } = ctx.view.state;
    if (adding) {
      const result = await addMapping(interaction.guild, BigInt(adding), target);
      if (!result.ok) {
        await toast.followUp(interaction, S.errors.familyMapped, { accent: accent.warning });
        await ctx.updateState({ adding: undefined });
        return { action: 'render' };
      }
      await ctx.updateState({ adding: undefined, selected: result.source.id, removing: false });
      await warnIfUnusable(interaction, result.source.destination);
      return { action: 'render' };
    }

    const source = selected ? await getSource(selected) : undefined;
    if (!source || source.guild !== BigInt(interaction.guildId!)) return { action: 'render' };
    await retargetMapping(source, target);
    const updated = await getSource(source.id);
    if (updated) await warnIfUnusable(interaction, updated.destination);
    return { action: 'render' };
  },
});

/**
 * The server's off-server archives, from `/archives offsite manage`: each
 * on-server archive family (a category chain: `Archives 1…N`, a Hall of
 * Fame, a queue's archive) and the archive server category its games are
 * copied into. Pick a category to map it, pick a mapping to point it
 * elsewhere or remove it. Bound to the guild (`entityId`), and every write
 * goes to the guild the actor was checked in. Mapping to a destination
 * also takes Manage Server there, checked on the modal's submit.
 */
export default createView<OffsiteState>()({
  id: 'aoffsite',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: {},
  guards: {
    '*': [inGuild],
    pick: manages,
    add: manages,
    change: manages,
    remove: manages,
    'remove-confirm': manages,
    'remove-cancel': manages,
    'target-submit': manages,
  },

  render: async (view, _db, client) => {
    const guild = client.guilds.cache.get(view.entityId!);
    if (!guild) return v2(linear(text(S.errors.guildOnly)));

    const lines = await describeMappings(client, guild);
    const unmapped = await unmappedArchives(
      guild,
      lines.map((line) => line.resolved),
    );
    const selected = lines.find((line) => line.resolved.source.id === view.state.selected);

    const body = [
      S.offsite.manageTitle,
      lines.length === 0
        ? S.offsite.noMappings
        : lines
            .map((line) => `**${line.family}** → ${line.target}${line.problem ? `\n-# ⚠ ${line.problem}` : ''}`)
            .join('\n'),
      ...(unmapped.length > 0 ? [S.offsite.unmapped(unmapped)] : []),
    ].join('\n');

    const add = channelSelect(view.customId('add'), S.offsite.addPlaceholder)
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(1)
      .setMaxValues(1);

    const rows = [];
    if (lines.length > 0) {
      const menu = select(view.customId('pick'), S.offsite.pickPlaceholder).addOptions(
        lines.slice(0, 25).map((line) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(line.family.slice(0, 100))
            .setDescription(line.plain.slice(0, 100))
            .setValue(line.resolved.source.id)
            .setDefault(line.resolved.source.id === selected?.resolved.source.id),
        ),
      );
      rows.push(selectRow(menu));
    }
    rows.push(channelSelectRow(add));
    if (selected) {
      rows.push(
        view.state.removing
          ? buttonRow(
              button(view.customId('remove-confirm'), S.offsite.removeConfirm(selected.family), ButtonStyle.Danger),
              button(view.customId('remove-cancel'), S.common.cancel, ButtonStyle.Secondary),
            )
          : buttonRow(
              button(view.customId('change'), S.offsite.change, ButtonStyle.Primary),
              button(view.customId('remove'), S.offsite.remove, ButtonStyle.Danger),
            ),
      );
    }

    return {
      ...v2(linear(text(body), separator(), ...rows, separator(), dismiss.row(view))),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
    ...targetModal.interactions,

    pick: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ selected: interaction.values[0], removing: false });
      return { action: 'render' };
    },

    // The modal must be the first answer to the select, so the pick is kept in state for its submit.
    add: async (interaction, ctx) => {
      if (!interaction.isChannelSelectMenu()) return;
      await ctx.updateState({ adding: interaction.values[0] });
      await targetModal.show(interaction, ctx, { title: S.offsite.addTitle });
    },

    change: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const source = ctx.view.state.selected ? await getSource(ctx.view.state.selected) : undefined;
      const destination = source ? await getDestination(source.destination) : undefined;
      await ctx.updateState({ adding: undefined });
      await targetModal.show(interaction, ctx, {
        values: destination ? { guild: String(destination.destGuild), category: String(destination.category) } : {},
      });
    },

    remove: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ removing: true });
      return { action: 'render' };
    },

    'remove-cancel': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ removing: false });
      return { action: 'render' };
    },

    // The family stops being copied; its copies already made stay where they are, and on record.
    'remove-confirm': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      if (ctx.view.entityId === interaction.guildId && ctx.view.state.selected) {
        await deleteSource(BigInt(interaction.guildId!), ctx.view.state.selected);
      }
      await ctx.updateState({ selected: undefined, removing: false });
      return { action: 'render' };
    },
  },
});
