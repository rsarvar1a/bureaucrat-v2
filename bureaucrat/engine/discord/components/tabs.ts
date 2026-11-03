import { ButtonStyle, type ButtonBuilder } from 'discord.js';
import { button, buttonRow } from '../elements';
import type { ViewRow, InteractionHandler } from '../views/types';

/** `style` defaults to Secondary; a destructive tab such as Delete is Danger so it reads as one from the strip. */
export type Tab<K extends string> = { key: K; label: string; style?: ButtonStyle };

export type TabActions<K extends string> = `tab-${K}`;

/** Discord puts five buttons on a row, and the strip is one row. */
export const MAX_TABS = 5;

type TabsOptions<S, F extends keyof S & string, K extends string> = {
  /** The state field that holds the active key - where the viewer is looking, not a property of the entity. */
  field: F;
  /** At most five: the strip is a single button row. */
  tabs: Tab<K>[];
  /**
   * Shown when state holds nothing, or a key that no longer exists.
   *
   * Defaults are merged at spawn only, so a pane that was open before a tab was
   * added or renamed carries a stale value; trusting it would render a bare
   * strip with nothing under it.
   */
  fallback: K;
};

type Tabs<S, K extends string> = {
  /** The tab to render, after the fallback rule. */
  active: (view: ViewRow<S>) => K;
  /** The strip: Secondary buttons, the active one disabled, `trailing` appended to the same row. */
  row: (view: ViewRow<S>, ...trailing: ButtonBuilder[]) => ReturnType<typeof buttonRow>;
  /** Every action the strip can dispatch, for a view that needs to list them. */
  actions: TabActions<K>[];
  interactions: Record<TabActions<K>, InteractionHandler<S>>;
};

/**
 * A mode-switched pane: one view, several faces.
 *
 * Replaces a pane that branches into child panes - a message and a View row
 * apiece, each with its own Dismiss to find on the way back - with a single
 * ephemeral view whose body and controls follow a key held in its state.
 *
 * Tabs are navigation, so they belong under a view's `'*'` guards only, like
 * `dismiss`. Permission guards go on the acting keys inside each tab: a viewer
 * who may look should be able to look everywhere, and a replayed custom id for
 * an action is refused by that action's guard regardless of which tab is up.
 *
 * The strip is the pane's header: render it first, a separator, then the tab's
 * content, its actions, and the pane's own controls last. A pane that can
 * delete its entity puts Delete on the strip as a Danger tab rather than
 * among the actions, so the one irreversible thing is never beside Edit. Keep each tab inside Discord's
 * five action rows, counting the strip itself.
 */
export const tabs =
  <S>() =>
  <F extends keyof S & string, K extends Extract<S[F], string>>(options: TabsOptions<S, F, K>): Tabs<S, K> => {
    const { field, tabs: strip, fallback } = options;

    if (strip.length > MAX_TABS) {
      throw new Error(`A tab strip holds at most ${MAX_TABS} tabs; ${strip.length} were given.`);
    }

    const keys = new Set<string>(strip.map((tab) => tab.key));

    const active = (view: ViewRow<S>): K => {
      const held = (view.state as Record<string, unknown> | null)?.[field];
      return typeof held === 'string' && keys.has(held) ? (held as K) : fallback;
    };

    const row = (view: ViewRow<S>, ...trailing: ButtonBuilder[]) => {
      const current = active(view);

      return buttonRow(
        ...strip.map((tab) =>
          button(
            view.customId(`tab-${tab.key}`),
            tab.label,
            tab.key === current ? ButtonStyle.Primary : (tab.style ?? ButtonStyle.Secondary),
          ).setDisabled(tab.key === current),
        ),
        ...trailing,
      );
    };

    const actions = strip.map((tab) => `tab-${tab.key}` as TabActions<K>);

    const interactions = Object.fromEntries(
      strip.map((tab) => [
        `tab-${tab.key}`,
        (async (interaction, ctx) => {
          if (!interaction.isMessageComponent()) return;
          await interaction.deferUpdate();

          await ctx.updateState({ [field]: tab.key } as Partial<S>);

          return { action: 'render' };
        }) satisfies InteractionHandler<S>,
      ]),
    ) as Record<TabActions<K>, InteractionHandler<S>>;

    return { active, row, actions, interactions };
  };
