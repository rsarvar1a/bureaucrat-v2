import { ButtonStyle, type ButtonBuilder } from 'discord.js';
import { button, buttonRow, separator, text } from '../elements';
import type { SpawnOptions } from '../views/lifecycle';
import { registerStack, replaceChildWindow } from '../views/windows';
import type { InteractionHandler, ViewContext, ViewRow } from '../views/types';
import { tabs, type Tab, type TabActions } from './tabs';

/** A tab that opens a window and nothing more: what an inlined strip is made of. */
export type Leaf<K extends string> = Tab<K> & {
  /** The route to open beneath the header while this tab is active. */
  window: string;
};

/**
 * A header's strip without its route or state field, so one declaration can
 * serve both as a header of its own and as a row inlined into its parent.
 */
export type Strip<C extends string> = { tabs: Leaf<C>[]; fallback: C };

export type StackTab<K extends string, C extends string = string> = Leaf<K> & {
  /**
   * Draw the header this tab opens as a second row here instead of opening
   * it: `window` is then the route the strip belongs to, not a message, and
   * the window beneath this header is whichever leaf the inlined strip has
   * active. Add or remove this to try either shape without touching the views.
   */
  inline?: Strip<C>;
};

/** The nested selection an inlined strip keeps in its parent's state, keyed `<field>:<parent tab>`. */
export type NestedState<F extends string, P extends string, C extends string> = { [K in `${F}:${P}`]?: C };

export type NestedTabActions<K extends string> = `tab-${K}-${string}`;

type StackOptions<S, F extends keyof S & string, K extends string> = {
  /** The header's own route, so `openWindow` can open its default child with it. */
  route: string;
  field: F;
  tabs: StackTab<K>[];
  fallback: K;
  /** Extra spawn options for the child, computed from the header's context (state to pass down, say). */
  spawn?: (ctx: ViewContext<S>) => SpawnOptions;
};

type Stack<S, K extends string> = {
  active: (view: ViewRow<S>) => K;
  /** This header's own strip, `trailing` appended to the same row. */
  row: (view: ViewRow<S>, ...trailing: ButtonBuilder[]) => ReturnType<typeof buttonRow>;
  /**
   * The strip and, when the active tab inlines a header, a separator, a
   * subtitle naming that tab and the inlined strip beneath it.
   */
  rows: (
    view: ViewRow<S>,
    ...trailing: ButtonBuilder[]
  ) => (ReturnType<typeof buttonRow> | ReturnType<typeof separator> | ReturnType<typeof text>)[];
  actions: (TabActions<K> | NestedTabActions<K>)[];
  /** The window the active tab wants beneath the header. */
  window: (view: ViewRow<S>) => string;
  interactions: Record<TabActions<K> | NestedTabActions<K>, InteractionHandler<S>>;
};

/**
 * A header whose tabs choose the window beneath it.
 *
 * `tabs` with one difference: a press does not change what this view shows so
 * much as what the next message down shows. Each tab names a route; pressing
 * it closes whatever is under the header and opens that route in its place,
 * parented to the header so the child inherits its entity and ids.
 *
 * A tab whose route is itself a header can be **inlined**: its strip is drawn
 * as a second row of this message, behind a separator and under a subtitle
 * naming the tab, and the window beneath is the leaf that strip has active. The stack is then one message shorter
 * for every inlined level. The nested selection lives in this header's state
 * under `<field>:<tab>`, and its presses are `tab-<tab>-<leaf>`.
 *
 * Windows have no Dismiss. The header closes them, and whatever ends the
 * header - a destroy subscription, usually - takes them down with it. Keep
 * each window inside five rows, counting its own strip if it is a header too.
 */
export const stack =
  <S>() =>
  <F extends keyof S & string, K extends Extract<S[F], string>>(options: StackOptions<S, F, K>): Stack<S, K> => {
    const { route, field, tabs: strip, fallback, spawn } = options;

    const base = tabs<S>()({ field, tabs: strip, fallback });

    const byKey = new Map<string, StackTab<K>>(strip.map((tab) => [tab.key, tab]));

    const nestedField = (tab: StackTab<K>) => `${field}:${tab.key}`;

    const nestedActive = (view: ViewRow<S>, tab: StackTab<K>): Leaf<string> => {
      const inline = tab.inline!;
      const held = (view.state as Record<string, unknown> | null)?.[nestedField(tab)];
      return inline.tabs.find((leaf) => leaf.key === held) ?? inline.tabs.find((leaf) => leaf.key === inline.fallback)!;
    };

    const window = (view: ViewRow<S>): string => {
      const tab = byKey.get(base.active(view))!;
      return tab.inline ? nestedActive(view, tab).window : tab.window;
    };

    const rows = (view: ViewRow<S>, ...trailing: ButtonBuilder[]) => {
      const own = base.row(view, ...trailing);
      const tab = byKey.get(base.active(view))!;
      if (!tab.inline) return [own];

      const current = nestedActive(view, tab);

      // The subtitle says which top-level tab the nested ribbon belongs to,
      // since the active root tab is only a disabled button above it.
      return [
        own,
        separator(),
        text(`**${tab.label}**`),
        buttonRow(
          ...tab.inline.tabs.map((leaf) =>
            button(
              view.customId(`tab-${tab.key}-${leaf.key}`),
              leaf.label,
              leaf.key === current.key ? ButtonStyle.Primary : (leaf.style ?? ButtonStyle.Secondary),
            ).setDisabled(leaf.key === current.key),
          ),
        ),
      ];
    };

    registerStack(route, { window: window as (view: ViewRow<never>) => string });

    const open = async (
      ctx: ViewContext<S>,
      interaction: Parameters<InteractionHandler<S>>[0],
      patch: Record<string, string>,
      target: string,
    ) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      await ctx.updateState(patch as Partial<S>);
      await replaceChildWindow(ctx as ViewContext<unknown>, interaction, target, spawn?.(ctx));

      return { action: 'render' as const };
    };

    const entries: [string, InteractionHandler<S>][] = strip.flatMap((tab) => [
      [
        `tab-${tab.key}`,
        (interaction, ctx) =>
          open(ctx, interaction, { [field]: tab.key }, tab.inline ? nestedActive(ctx.view, tab).window : tab.window),
      ],
      ...(tab.inline?.tabs ?? []).map((leaf): [string, InteractionHandler<S>] => [
        `tab-${tab.key}-${leaf.key}`,
        (interaction, ctx) => open(ctx, interaction, { [field]: tab.key, [nestedField(tab)]: leaf.key }, leaf.window),
      ]),
    ]);

    const interactions = Object.fromEntries(entries) as Stack<S, K>['interactions'];
    const actions = entries.map(([action]) => action) as Stack<S, K>['actions'];

    return { active: base.active, row: base.row, rows, actions, window, interactions };
  };
