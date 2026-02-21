import {
  bigint as pgBigint,
  integer as pgInteger,
  uuid as pgUuid,
} from 'drizzle-orm/pg-core';
import type {
  AnyPgColumn,
  PgBigInt64Builder,
  PgColumn,
  PgIntegerBuilder,
  PgUUIDBuilder,
  ReferenceConfig,
  SetNotNull,
} from 'drizzle-orm/pg-core';

type _DataTypeToBuilder = {
  'string uuid': PgUUIDBuilder;
  'number int32': PgIntegerBuilder;
  'bigint int64': PgBigInt64Builder;
};

type _SupportedBuilders = _DataTypeToBuilder[keyof _DataTypeToBuilder];

type _DataType<T extends AnyPgColumn> = T['_']['dataType'];

type _ColumnToBuilder<T extends AnyPgColumn> =
  _DataType<T> extends keyof _DataTypeToBuilder
    ? _DataTypeToBuilder[_DataType<T>]
    : never;

type FKOptions = { nullable?: true } & Partial<ReferenceConfig['config']>;

/**
 * Creates a column that references the given table column as a foreign key.
 * The column type is automatically matched to the referenced column.
 * Columns are NOT NULL by default; pass `{ nullable: true }` to allow nulls.
 */
export function fk<T extends AnyPgColumn>(
  column: T,
  options: FKOptions & { nullable: true },
): _ColumnToBuilder<T>;

/**
 * Creates a column that references the given table column as a foreign key.
 * The column type is automatically matched to the referenced column.
 * Columns are NOT NULL by default; pass `{ nullable: true }` to allow nulls.
 */
export function fk<T extends AnyPgColumn>(
  column: T,
  options?: Partial<ReferenceConfig['config']>,
): SetNotNull<_ColumnToBuilder<T>>;

/**
 * Creates a column that references the given table column as a foreign key.
 * The column type is automatically matched to the referenced column.
 * Columns are NOT NULL by default; pass `{ nullable: true }` to allow nulls.
 */
export function fk(column: AnyPgColumn, options?: FKOptions) {
  const { nullable, ...config } = options ?? {};

  const sqlType = (column as PgColumn).getSQLType();
  const builders: Record<string, () => _SupportedBuilders> = {
    uuid: () => pgUuid(),
    integer: () => pgInteger(),
    bigint: () => pgBigint({ mode: 'bigint' }),
  };

  const createBuilder = builders[sqlType];
  if (!createBuilder) {
    throw new Error(`Unsupported foreign key column type: ${sqlType}`);
  }

  let builder = createBuilder();
  if (!nullable) builder = builder.notNull();
  return builder.references(() => column, config);
}
