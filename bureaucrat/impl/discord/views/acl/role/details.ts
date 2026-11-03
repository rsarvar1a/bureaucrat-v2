import { text, separator, linear } from '../../../../../engine/discord/elements';
import type { AclRole, AclBinding, AclGrant } from '../../../../../schema/acl/grants.sql';
import { bindingLines } from './bindings';

type Role = typeof AclRole.$inferSelect;
type Binding = typeof AclBinding.$inferSelect;
type Grant = typeof AclGrant.$inferSelect;

/** The Details tab body: the role and a summary of what the other two tabs hold. */
export const renderDetails = (role: Role, bindings: Binding[], grants: Grant[]): Parameters<typeof linear> => {
  const allowed = grants.filter((g) => g.decision === 'allow').length;
  const denied = grants.filter((g) => g.decision === 'deny').length;
  const grantSummary = grants.length === 0 ? '*No permissions configured.*' : `${allowed} allowed, ${denied} denied`;

  return [
    text(`### Role: ${role.name}`),
    text(`**Priority:** ${role.priority}`),
    separator(),
    text(`**Bindings**\n${bindingLines(bindings)}`),
    separator(),
    text(`**Permissions:** ${grantSummary}`),
    separator(),
  ];
};
