import { ButtonStyle } from 'discord.js';
import { button } from '../elements';
import type { InteractionHandler, ViewRow } from '../views/types';

/** At least one, so an empty list still has a page to say so on. */
export const pageCount = (items: number, size: number): number => Math.max(1, Math.ceil(items / size));

/** A held page can outlive the list that shrank under it. */
export const clampPage = (page: number, pages: number): number => Math.min(Math.max(0, page), pages - 1);

/** The window of `items` on a page that has already been clamped. */
export const pageItems = <T>(items: T[], page: number, size: number): T[] =>
  items.slice(page * size, page * size + size);

type PagerOptions<F extends string> = {
  /** The state field holding the page, which belongs to the viewer rather than the entity. */
  field: F;
};

/**
 * ◀ ▶ over a page number in state. The buttons are returned bare so they can
 * share a row with the pane's other controls.
 */
export const pager =
  <S>() =>
  <F extends keyof S & string>({ field }: PagerOptions<F>) => {
    const held = (view: ViewRow<S>): number => {
      const page = (view.state as Record<string, unknown> | null)?.[field];
      return typeof page === 'number' ? page : 0;
    };

    const move =
      (by: 1 | -1): InteractionHandler<S> =>
      async (interaction, ctx) => {
        if (!interaction.isMessageComponent()) return;
        await interaction.deferUpdate();
        await ctx.updateState({ [field]: Math.max(0, held(ctx.view) + by) } as Partial<S>);
        return { action: 'render' };
      };

    return {
      held,
      buttons: (view: ViewRow<S>, pages: number) => {
        const page = clampPage(held(view), pages);
        return [
          button(view.customId('prev'), '◀', ButtonStyle.Secondary).setDisabled(page === 0),
          button(view.customId('next'), '▶', ButtonStyle.Secondary).setDisabled(page >= pages - 1),
        ];
      },
      interactions: { prev: move(-1), next: move(1) },
    };
  };
