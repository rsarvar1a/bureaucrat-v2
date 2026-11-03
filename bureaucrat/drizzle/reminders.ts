import { and, asc, eq, not, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Reminder } from '../schema/core/reminders.sql';

type InsertReminder = typeof Reminder.$inferInsert;

export type ReminderRow = typeof Reminder.$inferSelect;

/** Not cancelled and not yet finally posted. */
const pending = and(not(Reminder.cancelled), sql`not (0 = any(${Reminder.posted}))`);

export const insertReminder = async (row: InsertReminder) => {
  const [inserted] = await db.insert(Reminder).values(row).returning();
  return inserted!;
};

export const getReminder = async (id: string) => {
  const [row] = await db.select().from(Reminder).where(eq(Reminder.id, id));
  return row;
};

export const listPendingReminders = async () => db.select().from(Reminder).where(pending).orderBy(asc(Reminder.fireAt));

export const listPendingRemindersOfGame = async (gameId: string) =>
  db
    .select()
    .from(Reminder)
    .where(and(eq(Reminder.game, gameId), pending))
    .orderBy(asc(Reminder.fireAt));

/**
 * Read, merge, write: the column's own array encoding does the work, where a
 * raw `::integer[]` parameter is one the driver cannot serialise. Only the
 * engine's single ticker writes `posted`, so the two steps do not race.
 */
export const markPosted = async (id: string, offsets: number[]) => {
  const row = await getReminder(id);
  if (!row) return;
  const posted = [...new Set([...row.posted, ...offsets])].sort((a, b) => b - a);
  await db.update(Reminder).set({ posted }).where(eq(Reminder.id, id));
};

export const cancelReminder = async (id: string) => {
  const [row] = await db.update(Reminder).set({ cancelled: true }).where(eq(Reminder.id, id)).returning();
  return row;
};
