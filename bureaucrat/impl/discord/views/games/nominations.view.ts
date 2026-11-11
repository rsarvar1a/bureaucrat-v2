import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { text, separator, linear, buttonRow, button, select, selectRow, v2 } from '../../../../engine/discord/elements';
import { modal, field } from '../../../../engine/discord/components/modal';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getOrCreateGameSettings, updateGameSettings } from '../../../../drizzle/game-settings';
import { formatDuration, parseDuration } from '../../games/duration';
import { S } from '../../../../strings';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { GameEvents } from './events';

type NominationsState = Record<string, never>;

type Toggle = {
  slug: string;
  column: 'nominateStoryteller';
  label: string;
  whenTrue: string;
  whenFalse: string;
};

const TOGGLES: Toggle[] = [
  {
    slug: 'st',
    column: 'nominateStoryteller',
    label: 'Nominate the Storyteller',
    whenTrue: 'allowed',
    whenFalse: 'off',
  },
];

/** The select's value for the game channel; a planned thread is `t:<name>`. */
const CHANNEL = 'channel';

// How long into a day before nominations open on their own; blank turns it off.
const afterModal = modal<NominationsState>()({
  action: 'after',
  title: 'Auto-open nominations',
  fields: {
    // A label holds 45 characters; the rest of the hint goes in the description.
    after: field.short('How long into a day (like 2h30m)', {
      description: 'Leave it blank to open them by hand from Phases.',
      required: false,
      maxLength: 40,
    }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const raw = values['after']?.trim() ?? '';
    const after = raw ? parseDuration(raw) : null;
    if (raw && after === null) {
      await toast.followUp(interaction, S.errors.badDuration, { accent: accent.warning });
      return { action: 'render' };
    }

    await updateGameSettings(ctx.view.entityId!, { nominationsAfter: after });
    await ctx.notify(GameEvents.Changed);
    return { action: 'render' };
  },
});

// Window C. What is decided here is read when nominations open, so the thread
// is kept by its planned name and resolved by tag once Start has created it.
export default createView<NominationsState>()({
  id: 'gnominations',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const settings = await getOrCreateGameSettings(view.entityId!);
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    // A thread dropped from the plan since it was picked falls back to the channel.
    const bound =
      settings.nominationThread && settings.plannedThreads.includes(settings.nominationThread)
        ? settings.nominationThread
        : null;

    return v2(
      linear(
        text('### Nominations'),
        text(
          [
            settings.nominationsAfter === null
              ? 'Nominations open when a Storyteller opens them from Phases.'
              : `Nominations open ${formatDuration(settings.nominationsAfter)} into each day.`,
          ].join('\n'),
        ),
        separator(),
        selectRow(
          select(customId('thread'), 'Where nominations happen').addOptions(
            { label: 'Game channel', value: CHANNEL, default: bound === null },
            ...settings.plannedThreads.slice(0, 24).map((name) => ({
              label: name,
              description: 'planned public thread',
              value: `t:${name}`,
              default: name === bound,
            })),
          ),
        ),
        buttonRow(
          ...TOGGLES.map((toggle) =>
            button(
              customId(`toggle:${toggle.slug}`),
              `${toggle.label} · ${settings[toggle.column] ? toggle.whenTrue : toggle.whenFalse}`,
              settings[toggle.column] ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
          ),
          button(
            customId('after'),
            `Auto-open · ${settings.nominationsAfter === null ? 'off' : `after ${formatDuration(settings.nominationsAfter)}`}`,
            settings.nominationsAfter === null ? ButtonStyle.Secondary : ButtonStyle.Success,
          ),
        ),
      ),
    );
  },

  interactions: {
    ...afterModal.interactions,

    after: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      await afterModal.show(interaction, ctx, {
        values: {
          after: settings.nominationsAfter === null ? '' : formatDuration(settings.nominationsAfter).replace(/\s/g, ''),
        },
      });
    },

    thread: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const picked = interaction.values[0] ?? CHANNEL;
      await updateGameSettings(ctx.view.entityId!, {
        nominationThread: picked.startsWith('t:') ? picked.slice(2) : null,
      });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },

    // `toggle:<slug>`; read then write so two Storytellers flip what is stored.
    '*': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const [verb, slug] = ctx.action.split(':');
      const toggle = verb === 'toggle' ? TOGGLES.find((t) => t.slug === slug) : undefined;
      if (!toggle) return { action: 'render' };

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      await updateGameSettings(ctx.view.entityId!, { [toggle.column]: !settings[toggle.column] });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },
  },
});
