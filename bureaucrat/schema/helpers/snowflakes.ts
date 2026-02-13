import { integer } from 'drizzle-orm/pg-core';

const intnotnull = () => integer().notNull();

/**
 *  The snowflake object classes relevant to Bureaucrat.
 */
export type SnowflakeReferenceable = 'guild' | 'category' | 'channel' | 'thread' | 'message' | 'member' | 'role';

type _IntNotNull = ReturnType<typeof intnotnull>;
type _ColumnSet<T extends SnowflakeReferenceable> = Record<T, _IntNotNull>;

/**
 *  Given a set of Discord object types referenceable by snowflake, produces a subset of non-null integer columns for them.
 */
export const snowflakes = <T extends SnowflakeReferenceable>(...kinds: T[]): _ColumnSet<T> =>
  Object.fromEntries(kinds.map((k: T) => [k, intnotnull()])) as _ColumnSet<T>;
