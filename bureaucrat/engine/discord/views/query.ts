import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../utilities/db';
import { View } from '../../../schema/abc/views.sql';

export type StoredView = typeof View.$inferSelect;

type Where = {
  route?: string;
  entityId?: string;
  entityIds?: string[];
  parent?: string;
  visibility?: 'public' | 'ephemeral';
};

/** View rows matching every given field. At least one field, or the whole table comes back. */
export const listViews = async (where: Where): Promise<StoredView[]> => {
  const clauses: SQL[] = [];
  if (where.route !== undefined) clauses.push(eq(View.route, where.route));
  if (where.entityId !== undefined) clauses.push(eq(View.entityId, where.entityId));
  if (where.entityIds !== undefined) clauses.push(inArray(View.entityId, where.entityIds));
  if (where.visibility !== undefined) clauses.push(eq(View.visibility, where.visibility));
  if (where.parent !== undefined) clauses.push(eq(View.parent, where.parent));

  return db
    .select()
    .from(View)
    .where(clauses.length > 0 ? and(...clauses) : undefined);
};

/**
 * Every view beneath `viewId`, deepest first - the mirror of `resolveAncestry`.
 *
 * Deepest first because that is the order to take messages down in: a parent
 * row cascades its children's rows away on delete, so anything that must happen
 * to a child's message has to happen before the parent's row goes.
 */
export const listDescendants = async (viewId: string): Promise<StoredView[]> => {
  const rows = await db.execute<StoredView & { depth: number }>(sql`
    WITH RECURSIVE below AS (
      SELECT v.*, 1 AS depth
      FROM abc."View" v
      WHERE v.parent = ${viewId}
      UNION ALL
      SELECT v.*, b.depth + 1
      FROM abc."View" v
      JOIN below b ON v.parent = b.id
    )
    SELECT * FROM below ORDER BY depth DESC
  `);

  // `db.execute` hands back raw columns: snowflakes arrive as strings, so they
  // are coerced to what the typed row promises before anybody reads them.
  return rows.map(({ depth, ...row }) => ({
    ...(void depth, row),
    channel: BigInt(row.channel),
    message: BigInt(row.message),
    member: row.member === null ? null : BigInt(row.member),
  }));
};
