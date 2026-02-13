import { timestamp } from 'drizzle-orm/pg-core';

/**
 *  Creates a timestamp column that is automatically defaulted to the current datetime if not provided.
 */
export const automaticTimestamp = () => timestamp().notNull().defaultNow();

/**
 *  Creates a standard set of timestamp columns for record audit purposes.
 */
export const timestamps = () => ({
  createdAt: automaticTimestamp(),
  updatedAt: automaticTimestamp().$onUpdate(() => new Date()),
});
