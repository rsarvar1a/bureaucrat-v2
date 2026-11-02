import { text, separator, linear, select, selectRow } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import { PermissionsByDomain } from '../../../../acl/permissions';
import type { AclGrant } from '../../../../../schema/acl/grants.sql';

type Grant = typeof AclGrant.$inferSelect;

export type PermissionsState = { selectedPermission: string | null };

export const decisionIcon = (decision: 'allow' | 'deny' | null): string => {
  if (decision === 'allow') return '✅';
  if (decision === 'deny') return '⛔';
  return '⬜';
};

/** The Permissions tab: the matrix by domain, and a picker for the one to change. */
export const renderPermissions = (
  view: ViewRow<PermissionsState>,
  roleName: string,
  grants: Grant[],
): { body: Parameters<typeof linear>; controls: Parameters<typeof linear> } => {
  const grantMap = new Map(grants.map((g) => [g.permission, g.decision]));

  const sections = Object.entries(PermissionsByDomain).map(([domain, perms]) => {
    const lines = perms.map((p) => {
      const selected = view.state.selectedPermission === p.permission ? ' ◀' : '';
      return ` ${decisionIcon(grantMap.get(p.permission) ?? null)}  ${p.label}${selected}`;
    });
    return text(`**${domain}**\n${lines.join('\n')}`);
  });

  const picker = selectRow(
    select(view.customId('grant-select'), 'Select a permission to edit').addOptions(
      Object.values(PermissionsByDomain)
        .flat()
        .map((p) => ({
          label: p.label,
          value: p.permission,
          description: p.permission,
          default: p.permission === view.state.selectedPermission,
        })),
    ),
  );

  return {
    body: [text(`### Permissions: ${roleName}`), text('*Scope: Server-wide*'), separator(), ...sections, separator()],
    controls: [picker],
  };
};
