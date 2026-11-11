import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../engine/discord/components/dismiss';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
} from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import {
  cancelReminder,
  getReminder,
  listPendingRemindersOfGame,
  type ReminderRow,
} from '../../../../drizzle/reminders';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { headsUpText, remainingHeadsUps } from '../../games/reminders/schedule';
import { ROLE_LABEL } from '../../games/roles';
import { GameEvents } from '../games/events';

type ListState = { selected: string | null };

const dismiss = dismissButton<ListState>()({ action: 'dismiss' });

const stamp = (date: Date) => Math.floor(date.getTime() / 1000);

const line = (r: ReminderRow) =>
  `<t:${stamp(r.fireAt)}:R> (<t:${stamp(r.fireAt)}:f>) in <#${r.channel}> · ${r.message.length > 80 ? `${r.message.slice(0, 77)}…` : r.message}` +
  `\n-# pings ${r.mentions.length > 0 ? r.mentions.map((m) => ROLE_LABEL[m]).join(', ') : 'nobody'} · heads-ups ${headsUpText(remainingHeadsUps(r))}`;

/** The game's pending reminders behind `/reminders list`: pick one, cancel it. */
export default createView<ListState>()({
  id: 'greminders',
  idParams: [],
  events: {},
  defaultState: { selected: null },
  subscribesTo: { render: [], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const reminders = (await listPendingRemindersOfGame(view.entityId!)).slice(0, 25);
    const selected = reminders.find((r) => r.id === view.state?.selected) ?? null;

    return v2(
      linear(
        text('### Reminders'),
        text(reminders.length > 0 ? reminders.map(line).join('\n') : '*No reminders pending.*'),
        separator(),
        ...(reminders.length > 0
          ? [
              selectRow(
                select(view.customId('select'), 'Pick a reminder')
                  .setMinValues(0)
                  .addOptions(
                    reminders.map((r) => ({
                      label: r.message.slice(0, 100),
                      description: `fires ${r.fireAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
                      value: r.id,
                      default: r.id === selected?.id,
                    })),
                  ),
              ),
              buttonRow(
                button(view.customId('cancel'), 'Cancel reminder', ButtonStyle.Danger).setDisabled(!selected),
                dismiss.button(view),
              ),
            ]
          : [dismiss.row(view)]),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ selected: interaction.values[0] ?? null });
      return { action: 'render' };
    },

    cancel: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const id = ctx.view.state?.selected;
      const reminder = id ? await getReminder(id) : undefined;
      if (reminder && reminder.game === ctx.view.entityId) {
        await cancelReminder(reminder.id);
        await toast.followUp(interaction, 'Reminder cancelled.', { accent: accent.success });
      }

      await ctx.updateState({ selected: null });
      return { action: 'render' };
    },
  },
});
