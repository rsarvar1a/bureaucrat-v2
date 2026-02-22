import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Bureaucrat's abstractions schema contains framework-level objects used by
 * the interaction routing and state management system. These are distinct from
 * the domain objects in the core schema.
 */
export const abc = pgSchema('abc');
