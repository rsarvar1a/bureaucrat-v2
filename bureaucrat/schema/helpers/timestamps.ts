import { timestamp } from 'drizzle-orm/pg-core';

/**
 *  Creates a timestamp column that is automatically defaulted to the current datetime if not provided.
 */
export const automaticTimestamp = () => timestamp().defaultNow();

/**
 *  Creates a standard set of timestamp columns for record audit purposes.
 */
export const timestamps = () => ({
  createdAt: automaticTimestamp().notNull(),
  updatedAt: automaticTimestamp()
    .notNull()
    .$onUpdate(() => new Date()),
});
