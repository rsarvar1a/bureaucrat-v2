import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * This is the abstractions schema, which helps us implement
 * anything that powers an application-level framework.
 */
export const abc = pgSchema('abc');
