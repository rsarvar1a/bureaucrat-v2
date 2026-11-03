import type { Participant } from '../../../../../schema/core/people.sql';

export type Role = (typeof Participant.$inferSelect)['role'];

export const ROLES: readonly Role[] = ['Player', 'Storyteller', 'Kibitzer'];

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

export const countByRole = (rows: { role: Role }[], role: Role): number => rows.filter((r) => r.role === role).length;

/** The first 25 of a list a select can show, and a line saying so when it is cut. */
export const firstPage = <T>(rows: T[]): { rows: T[]; note: string | null } => ({
  rows: rows.slice(0, 25),
  note: rows.length > 25 ? `Showing 25 of ${rows.length}.` : null,
});
