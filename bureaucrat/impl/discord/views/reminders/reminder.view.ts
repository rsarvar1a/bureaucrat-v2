import { ButtonStyle, ChannelType } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../engine/discord/components/modal';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  channelSelect,
  channelSelectRow,
  v2,
} from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGameByChannel } from '../../../../drizzle/games';
import { insertReminder } from '../../../../drizzle/reminders';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { formatDuration, parseDuration, parseOffsets } from '../../games/duration';
import { headsUpText } from '../../games/reminders/schedule';
import { LOGICAL_ROLES, ROLE_LABEL, type LogicalRole } from '../../games/roles';
import { GameEvents } from '../games/events';
import { S } from '../../../../strings';

/**
 * The pieces of a reminder, gathered one at a time: the duration is seconds
 * from when it is set, and `channel` where it posts (the game's channel or
 * any of its threads; null means where the form was opened).
 */
type ReminderState = {
  message: string;
  duration: number | null;
  offsets: number[];
  mentions: LogicalRole[];
  channel: string | null;
};

const isRole = (value: string): value is LogicalRole => (LOGICAL_ROLES as string[]).includes(value);

const messageModal = modal<ReminderState>()({
  action: 'message',
  title: 'Reminder message',
  fields: { message: field.paragraph('Add a reminder message', { maxLength: 1800 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();
    await ctx.updateState({ message: values['message']?.trim() ?? '' });
    return { action: 'render' };
  },
});

const timingModal = modal<ReminderState>()({
  action: 'timing',
  title: 'Reminder timing',
  fields: {
    duration: field.short('How long from now (like 1d13h4m2s)', { maxLength: 40 }),
    offsets: field.short('Heads-ups before it fires (like 4h 2h 1h)', { required: false, maxLength: 200 }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const duration = parseDuration(values['duration'] ?? '');
    if (duration === null) {
      await toast.followUp(interaction, S.errors.badDuration, { accent: accent.warning });
      return { action: 'render' };
    }

    const offsets = parseOffsets(values['offsets'] ?? '', duration);
    if (offsets === null) {
      await toast.followUp(interaction, S.errors.badOffsets, { accent: accent.warning });
      return { action: 'render' };
    }

    await ctx.updateState({ duration, offsets });
    return { action: 'render' };
  },
});

/**
 * The form behind `/reminders new` when the shortcut is not used: message and
 * timing through modals, the roles to ping from a select, then Set reminder.
 * Set closes the pane; `Ended` takes it down with the game.
 */
export default createView<ReminderState>()({
  id: 'greminder',
  idParams: [],
  events: {},
  defaultState: { message: '', duration: null, offsets: [], mentions: ['Player'], channel: null },
  subscribesTo: { render: [], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const state = view.state ?? { message: '', duration: null, offsets: [], mentions: [], channel: null };
    const ready = state.message.length > 0 && state.duration !== null;
    const pings = state.mentions.length > 0 ? state.mentions.map((r) => ROLE_LABEL[r]).join(', ') : 'nobody';
    const where = state.channel ?? String(view.channel);

    return v2(
      linear(
        text('### New reminder'),
        text(
          `**Message:** ${state.message || '*not set*'}\n` +
            `**Fires:** ${state.duration === null ? '*not set*' : `in ${formatDuration(state.duration)} from when it is set`}\n` +
            `**Heads-ups:** ${headsUpText(state.offsets)}\n` +
            `**Where:** <#${where}>\n` +
            `**Pings:** ${pings}`,
        ),
        separator(),
        // The game's channel or any of its threads, a player's ST thread included;
        // the pick is checked against the game, since the menu shows the whole server.
        channelSelectRow(
          channelSelect(view.customId('channel'), 'Where to post')
            .setChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
            .setMinValues(1)
            .setMaxValues(1)
            .setDefaultChannels(where),
        ),
        selectRow(
          select(view.customId('mentions'), 'Who to ping')
            .setMinValues(0)
            .setMaxValues(LOGICAL_ROLES.length)
            .addOptions(
              LOGICAL_ROLES.map((role) => ({
                label: ROLE_LABEL[role],
                value: role,
                default: state.mentions.includes(role),
              })),
            ),
        ),
        buttonRow(
          button(view.customId('message'), 'Message', ButtonStyle.Primary),
          button(view.customId('timing'), 'Timing', ButtonStyle.Primary),
          button(view.customId('set'), 'Set reminder', ButtonStyle.Success).setDisabled(!ready),
          button(view.customId('cancel'), 'Cancel', ButtonStyle.Secondary),
        ),
      ).setAccentColor(ready ? accent.success : accent.neutral),
    );
  },

  interactions: {
    ...messageModal.interactions,
    ...timingModal.interactions,

    message: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await messageModal.show(interaction, ctx, { values: { message: ctx.view.state?.message ?? '' } });
    },

    timing: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const state = ctx.view.state;
      await timingModal.show(interaction, ctx, {
        values: {
          duration: state?.duration ? formatDuration(state.duration).replace(/\s/g, '') : '',
          // Each heads-up compact (`1d13h`), since the field splits on spaces.
          offsets: (state?.offsets ?? []).map((o) => formatDuration(o).replace(/\s/g, '')).join(' '),
        },
      });
    },

    channel: async (interaction, ctx) => {
      if (!interaction.isChannelSelectMenu()) return;
      await interaction.deferUpdate();

      const chosen = interaction.values[0];
      const owner = chosen ? await getGameByChannel(BigInt(chosen)) : undefined;
      if (!chosen || owner?.id !== ctx.view.entityId) {
        await toast.followUp(interaction, S.errors.notGameChannel, { accent: accent.warning });
        return { action: 'render' };
      }

      await ctx.updateState({ channel: chosen });
      return { action: 'render' };
    },

    mentions: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ mentions: interaction.values.filter(isRole) });
      return { action: 'render' };
    },

    cancel: async (interaction) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      return { action: 'destroy' };
    },

    set: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const state = ctx.view.state;
      if (!state || !state.message || state.duration === null) return { action: 'render' };

      const fireAt = new Date(Date.now() + state.duration * 1000);
      const channel = state.channel ? BigInt(state.channel) : ctx.view.channel;
      await insertReminder({
        game: ctx.view.entityId!,
        author: BigInt(interaction.user.id),
        channel,
        message: state.message,
        fireAt,
        offsets: state.offsets,
        mentions: state.mentions,
      });

      await toast.followUp(
        interaction,
        `Reminder set for <t:${Math.floor(fireAt.getTime() / 1000)}:R> in <#${channel}>. Heads-ups: ${headsUpText(state.offsets)}.`,
        { accent: accent.success },
      );
      return { action: 'destroy' };
    },
  },
});
