import type { Client, TextBasedChannel } from 'discord.js';
import { injectCustomId } from './custom-id';
import { deleteViewMessage, destroyView, type SpawnOptions, type SpawnTarget } from './lifecycle';
import { listDescendants, listViews, type StoredView } from './query';
import type { ViewContext, ViewInteraction, ViewRow } from './types';
import { logger } from '../../../utilities/logger';

/**
 * Windows: public views that live in a channel as a stack of messages, opened
 * and closed by their parent rather than by a Dismiss of their own.
 *
 * A tree menu rendered this way is one message per level: the root is a header
 * whose tabs decide what the message beneath it shows; if that message is
 * itself a header, a third message sits beneath it, and so on. Switching a tab
 * closes everything beneath the header and opens the chosen window in its
 * place, which lands at the bottom of the channel - where it was, as long as
 * nothing else posts there.
 *
 * `View.parent` cascades on delete, so closing a window takes its descendant
 * rows with it for free; their messages are the part that needs doing by hand,
 * deepest first, before the row goes.
 */

/** A stack's contract with the engine: which window its active tab wants. */
type RegisteredStack = { window: (view: ViewRow<never>) => string };

const stacks = new Map<string, RegisteredStack>();

/**
 * Registers a header route so `openWindow` can open its default child along
 * with it. Called by the `stack` component at module load, which the view
 * loader guarantees happens before any spawn.
 */
export const registerStack = (route: string, stack: RegisteredStack): void => {
  stacks.set(route, stack);
};

/** The spawn the caller can perform: `ctx.spawnView` in a handler, `spawnView` with a definition elsewhere. */
export type Spawn = (route: string, target: SpawnTarget, options?: SpawnOptions) => Promise<ViewRow>;

/**
 * Opens a window, and beneath it whatever a registered stack says it wants
 * open first, all the way down.
 */
export const openWindow = async (
  spawn: Spawn,
  target: SpawnTarget,
  route: string,
  options: SpawnOptions = {},
): Promise<ViewRow> => {
  const row = await spawn(route, target, options);

  const stack = stacks.get(route);
  if (stack) await openWindow(spawn, target, stack.window(row as ViewRow<never>), { parent: row.id });

  return row;
};

/** Takes a window and everything beneath it off the channel, then out of the database. */
export const closeWindow = async (client: Client, row: StoredView): Promise<void> => {
  for (const below of await listDescendants(row.id)) {
    await deleteViewMessage(injectCustomId(below), client);
  }

  await deleteViewMessage(injectCustomId(row), client);
  await destroyView(row.id);
};

export const closeChildWindows = async (client: Client, view: { id: string }): Promise<void> => {
  for (const child of await listViews({ parent: view.id })) {
    await closeWindow(client, child);
  }
};

/**
 * Swaps what sits beneath a header: closes its children, then opens `route`
 * in the header's own channel.
 *
 * Close first, open second, never the reverse: a channel send deletes nothing,
 * so a failed open after a close leaves the header bare, which is recoverable
 * with another press, while a close after a failed open would leave two.
 */
export const replaceChildWindow = async (
  ctx: ViewContext<unknown>,
  interaction: ViewInteraction,
  route: string,
  options: SpawnOptions = {},
): Promise<ViewRow | null> => {
  await closeChildWindows(interaction.client, ctx.view);

  const channel = await interaction.client.channels.fetch(String(ctx.view.channel)).catch(() => null);
  if (!channel || !('send' in channel)) {
    logger.warn({ message: `Window ${ctx.view.id} has no channel to open ${route} in.` });
    return null;
  }

  return openWindow(ctx.spawnView, { interaction, channel: channel as TextBasedChannel }, route, options);
};
