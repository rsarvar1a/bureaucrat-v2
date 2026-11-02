import { timestamp } from 'drizzle-orm/pg-core';

export const automaticTimestamp = () => timestamp().notNull().defaultNow();

export const timestamps = () => ({
  createdAt: automaticTimestamp(),
  updatedAt: automaticTimestamp().$onUpdate(() => new Date()),
});
