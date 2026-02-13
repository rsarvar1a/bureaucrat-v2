import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Bureaucrat's core schema contains all objects related to the administration
 * of games, including functions like queues, archival, metaroles, etc..
 */
export const core = pgSchema('core');
