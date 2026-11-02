import { integer, text, unique } from 'drizzle-orm/pg-core';
import { primary, snowflakes, timestamps } from '../helpers';
import { fk } from '../helpers/foreign-key';
import { acl } from './.schema.sql';
import { GrantDecision } from './enums.sql';

export const AclRole = acl.table(
  'AclRole',
  {
    id: primary.uuid(),
    ...snowflakes('guild'),
    name: text().notNull(),
    priority: integer().notNull().default(0),
    ...timestamps(),
  },
  (table) => [unique().on(table.guild, table.name)],
);

export const AclBinding = acl.table('AclBinding', {
  id: primary.uuid(),
  aclRole: fk(AclRole.id, { onDelete: 'cascade' }),
  ...snowflakes(true, 'role'),
  ...snowflakes(true, 'member'),
  locationDomain: text(),
  locationId: text(),
  ...timestamps(),
});

export const AclGrant = acl.table(
  'AclGrant',
  {
    id: primary.uuid(),
    aclRole: fk(AclRole.id, { onDelete: 'cascade' }),
    permission: text().notNull(),
    decision: GrantDecision().notNull(),
    locationDomain: text(),
    locationId: text(),
    ...timestamps(),
  },
  (table) => [unique().on(table.aclRole, table.permission, table.locationDomain, table.locationId)],
);
