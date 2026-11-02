import { db } from '../../utilities/db';
import { AclRole, AclBinding, AclGrant } from '../../schema/acl/grants.sql';
import { eq } from 'drizzle-orm';
import { AllPermissions, Permissions } from './permissions';
import { invalidateGuildAcl } from './cache';

type SeedRole = {
  name: string;
  priority: number;
  grants: { permission: string; decision: 'allow' | 'deny' }[];
};

const defaultRoles: SeedRole[] = [
  {
    name: 'admin',
    priority: 100,
    grants: AllPermissions.map((p) => ({ permission: p, decision: 'allow' as const })),
  },
  {
    name: 'moderator',
    priority: 50,
    grants: [
      { permission: Permissions.Queue.Create, decision: 'allow' },
      { permission: Permissions.Queue.Edit, decision: 'allow' },
      { permission: Permissions.Queue.Delete, decision: 'allow' },
      { permission: Permissions.Queue.ManageEntries, decision: 'allow' },
      { permission: Permissions.Game.Create, decision: 'allow' },
      { permission: Permissions.Game.Manage, decision: 'allow' },
    ],
  },
  {
    name: 'maintainer',
    priority: 10,
    grants: [
      { permission: Permissions.Queue.Edit, decision: 'allow' },
      { permission: Permissions.Queue.ManageEntries, decision: 'allow' },
    ],
  },
];

/**
 * Seeds default ACL roles and grants for a guild if none exist.
 *
 * Called from `/settings permissions`. The member who runs it is bound to
 * `admin` server-wide in the same pass: once roles exist the Manage Guild
 * bootstrap fallback switches off, and without that binding the only person
 * left able to press anything would be the guild owner.
 */
export const seedDefaultRoles = async (guildId: bigint, bootstrap: { member: bigint }): Promise<void> => {
  const existing = await db.select({ id: AclRole.id }).from(AclRole).where(eq(AclRole.guild, guildId));
  if (existing.length > 0) return;

  for (const roleDef of defaultRoles) {
    const [role] = await db
      .insert(AclRole)
      .values({ guild: guildId, name: roleDef.name, priority: roleDef.priority })
      .returning();

    if (role && roleDef.grants.length > 0) {
      await db.insert(AclGrant).values(
        roleDef.grants.map((g) => ({
          aclRole: role.id,
          permission: g.permission,
          decision: g.decision,
        })),
      );
    }

    if (role && roleDef.name === 'admin') {
      await db.insert(AclBinding).values({ aclRole: role.id, member: bootstrap.member });
    }
  }

  invalidateGuildAcl(guildId);
};
