import { roleSelect, roleSelectRow } from '../elements';

/** Discord's ceiling on a select's picks. */
const MAX_ROLES = 25;

/**
 * A multiselect of Discord roles showing the current ones, any number of them
 * or none: picking nothing clears the list. The handler reads
 * `interaction.values` (`pickedRoles`).
 */
export const rolePickerRow = (customId: string, placeholder: string, current: readonly bigint[]) => {
  const menu = roleSelect(customId, placeholder).setMinValues(0).setMaxValues(MAX_ROLES);
  if (current.length > 0) menu.setDefaultRoles(current.slice(0, MAX_ROLES).map(String));
  return roleSelectRow(menu);
};

export const pickedRoles = (values: readonly string[]): bigint[] => values.map(BigInt);

/** The roles as mentions for a line of text, or `none` set. Mentions in a V2 body do not ping without `allowedMentions`. */
export const roleList = (roles: readonly bigint[], none: string): string =>
  roles.length === 0 ? none : roles.map((role) => `<@&${role}>`).join(', ');
