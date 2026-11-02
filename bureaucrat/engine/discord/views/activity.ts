import { eq } from 'drizzle-orm';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';
import { logger } from '../../../utilities/logger';
import type { ViewRow } from './types';

/**
 * Everything a live timeout is measured from, written in one place.
 *
 * Both sweeps expire on *idleness*, so something has to say "this was just
 * used". Leaving that to each handler made liveness opt-in: it was refreshed
 * as a side effect of writes those handlers happened to make - a view's state,
 * a session's cursor, an ephemeral's webhook token - and any handler that
 * changed nothing durable silently aged. Three console buttons had drifted into
 * exactly that state, and the next new handler could have just as easily.
 *
 * So `dispatch` calls this once per interaction instead, after the guards pass.
 * After, deliberately: a press that fails `isSessionOwner` is somebody else
 * touching your console, and must not keep your session alive.
 */

/**
 * Refreshes anything the view is bound to, beyond the view itself.
 *
 * The engine cannot know what an `entityId` means - sessions are an
 * application concept - so the application registers this at startup. Kept as
 * one observer rather than a field on `ViewDefinition` so that it covers views
 * the engine never sees declared, including apparatus views written inside a
 * content pack.
 */
type Observer = (view: ViewRow) => Promise<void>;

let observer: Observer | null = null;

export const observeViewActivity = (fn: Observer): void => {
  observer = fn;
};

/**
 * Marks a view as just used, and refreshes whatever it belongs to.
 *
 * `updatedAt` is written explicitly rather than left to the schema's
 * `$onUpdate`, because the point of this function is that the refresh is
 * something we *do* rather than something that falls out of another write.
 *
 * The observer runs after, and its failures are logged rather than thrown: an
 * idle clock not moving is worth a line in the log, never a dead interaction
 * the player has to see.
 */
export const markViewActive = async (view: ViewRow, patch: Partial<typeof View.$inferInsert> = {}): Promise<void> => {
  await db
    .update(View)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(View.id, view.id));

  if (!observer) return;

  try {
    await observer(view);
  } catch (error) {
    logger.error({ message: `Could not refresh activity for view ${view.id}.`, error });
  }
};
