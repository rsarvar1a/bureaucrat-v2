import { ErrorEvent } from '../schema/core/errors.sql';
import { db } from '../utilities/db';

export type InsertErrorEvent = typeof ErrorEvent.$inferInsert;

export const insertErrorEvent = async (row: InsertErrorEvent): Promise<void> => {
  await db.insert(ErrorEvent).values(row);
};
