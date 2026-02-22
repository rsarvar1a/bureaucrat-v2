import { lt } from 'drizzle-orm';
import { InteractionSession } from '../schema/abc/interaction-sessions.sql';
import { db } from '../utilities/db';

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

const getSessionTimeoutInterval = () =>
  process.env.SESSION_TIMEOUT_MS ? parseInt(process.env.SESSION_TIMEOUT_MS, 10) : DEFAULT_SESSION_TIMEOUT_MS;

/**
 * Starts a background sweep that deletes expired InteractionSession rows.
 * Interval is controlled by SESSION_TIMEOUT_MS in the environment
 * (defaults to 5 minutes).
 */
export function deleteExpiredInteractionSessionsJob(): void {
  setInterval(async () => {
    await db.delete(InteractionSession).where(lt(InteractionSession.expiresAt, new Date()));
  }, getSessionTimeoutInterval());
}
