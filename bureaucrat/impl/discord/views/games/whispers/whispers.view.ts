import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { bump, shown, stepperRow, stored, type Nudge } from '../../../../../engine/discord/components/stepper';
import {
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
} from '../../../../../engine/discord/elements';
import { getOrCreateGameSettings, updateGameSettings } from '../../../../../drizzle/game-settings';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { tablePlayers } from '../../../games/whispers/allowance';
import { defaultWhispers, whispersPerDay } from '../../../games/whispers/rules';
import { GameEvents } from '../events';
import {
  activeIn,
  asyncCap,
  MODE_LABEL,
  nextMode,
  SETTINGS,
  settingBySlug,
  toggleBySlug,
  toggleLabel,
  TOGGLES,
  withCap,
  withTable,
} from './settings';

type WhispersState = Record<string, never>;

/** The thread select's value for the game channel; a planned thread is `t:<name>`. */
const NOWHERE = 'none';

export default createView<WhispersState>()({
  id: 'gwhispers',
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

    const players = await tablePlayers(view.entityId!, settings);
    const total = whispersPerDay(settings, players);
    const steppers = SETTINGS.map((spec) => withTable(withCap(spec, total), defaultWhispers(players))).map((spec) =>
      stepperRow(customId, spec, shown(spec, settings[spec.column]), {
        disabled: !activeIn(spec, settings.whisperMode),
      }),
    );
    // A thread dropped from the plan since it was picked means the game channel.
    const bound =
      settings.whisperThread && settings.plannedThreads.includes(settings.whisperThread)
        ? settings.whisperThread
        : null;

    return v2(
      linear(
        text('### Whispers'),
        text(
          [
            'When group whispers are enabled, an N-player whisper costs each player N-1 whispers.',
            'When Traveler whispers are enabled, regular players can whisper them for free, except async whispers in Hybrid mode.',
            'When precise tracking is enabled, `/whisper end` adds a timestamp to each player.',
          ].join('\n'),
        ),
        separator(),
        buttonRow(
          button(customId('mode'), MODE_LABEL[settings.whisperMode], ButtonStyle.Primary),
          ...TOGGLES.map((toggle) =>
            button(
              customId(`toggle:${toggle.slug}`),
              toggleLabel(toggle, settings[toggle.column]),
              settings[toggle.column] ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
          ),
        ),
        ...steppers,
        selectRow(
          select(customId('thread'), 'Where whisper invitations are posted').addOptions(
            { label: 'The game channel', value: NOWHERE, default: bound === null },
            ...settings.plannedThreads.slice(0, 24).map((name) => ({
              label: name,
              description: 'planned public thread',
              value: `t:${name}`,
              default: name === bound,
            })),
          ),
        ),
      ),
    );
  },

  interactions: {
    // Invitation cards from now on go here; the ones already posted stay put.
    thread: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const picked = interaction.values[0] ?? NOWHERE;
      await updateGameSettings(ctx.view.entityId!, { whisperThread: picked.startsWith('t:') ? picked.slice(2) : null });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },

    mode: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      // Read then write, so two Storytellers on the pane advance what is
      // stored rather than what each last saw.
      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      await updateGameSettings(ctx.view.entityId!, { whisperMode: nextMode(settings.whisperMode) });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },

    // Every stepper press and toggle arrives here: `bump:<slug>:<nudge>` or `toggle:<slug>`.
    '*': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const [verb, slug, nudge] = ctx.action.split(':');
      const settings = await getOrCreateGameSettings(ctx.view.entityId!);

      if (verb === 'toggle' && slug) {
        const toggle = toggleBySlug(slug);
        if (!toggle) return { action: 'render' };
        await updateGameSettings(ctx.view.entityId!, { [toggle.column]: !settings[toggle.column] });
      } else if (verb === 'bump' && slug && nudge) {
        const found = settingBySlug(slug);
        if (!found || !activeIn(found, settings.whisperMode)) return { action: 'render' };
        const players = await tablePlayers(ctx.view.entityId!, settings);
        const spec = withCap(found, whispersPerDay(settings, players));
        const value = stored(spec, bump(spec, shown(spec, settings[spec.column]), nudge as Nudge));
        // Async whispers are a subset of the day's whispers: lowering the
        // main count pulls the async count down with it.
        const patch =
          spec.column === 'whispersPerDay'
            ? {
                whispersPerDay: value,
                asyncWhispersPerDay: Math.min(
                  settings.asyncWhispersPerDay,
                  asyncCap(whispersPerDay({ whispersPerDay: value }, players)),
                ),
              }
            : { asyncWhispersPerDay: value ?? 0 };
        await updateGameSettings(ctx.view.entityId!, patch);
      } else {
        return { action: 'render' };
      }

      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },
  },
});
