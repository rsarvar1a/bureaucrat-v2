import { bigint as pgBigint } from 'drizzle-orm/pg-core';

const bigint = () => pgBigint({ mode: 'bigint' });
const bigintnotnull = () => bigint().notNull();

/**
 *  The snowflake object classes relevant to Bureaucrat.
 */
export type SnowflakeReferenceable =
  | 'guild'
  | 'category'
  | 'channel'
  | 'thread'
  | 'message'
  | 'member'
  | 'role';

type _ColumnSet<T extends SnowflakeReferenceable, N> = Record<
  T,
  ReturnType<N extends true ? typeof bigint : typeof bigintnotnull>
>;

/**
 *  Creates a bigint column in JS mode to represent a snowflake.
 */
export const snowflake = bigint;

/**
 *  Given a set of Discord object types referenceable by snowflake, produces a subset of integer columns for them.
 *  Pass `true` as the first argument to make columns nullable.
 */
export const snowflakes = <
  TA extends [true, ...SnowflakeReferenceable[]] | SnowflakeReferenceable[],
  T extends SnowflakeReferenceable = Exclude<TA[number], true>,
  N = TA[0] extends true ? true : false,
>(
  ...args: TA
): _ColumnSet<T, N> => {
  const nullable = (() => {
    const nullable = args[0] === true;
    if (nullable) args.shift();
    return nullable;
  })();

  return Object.fromEntries(
    (args as T[]).map((k: T) => [k, nullable ? bigint() : bigintnotnull()]),
  ) as _ColumnSet<T, N>;
};
