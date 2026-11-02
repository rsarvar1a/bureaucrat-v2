/**
 * Two forms of the same labels.
 *
 * `AclEvents` holds **templates**, for `subscribesTo` and for publishers inside
 * the ACL tree: the framework resolves `${aclroles}` against the ids map it
 * already holds. Every ACL view descends from `aclroles`, whose `entityId` is
 * the guild, so the key is the root panel's route rather than `guild` - a key
 * nothing in ancestry would ever supply.
 *
 * `aclEvents(guild)` holds the **concrete** labels, for a publisher outside the
 * tree (a command, say) that has the guild in hand and no ids map to resolve
 * against.
 */
export const AclEvents = {
  RolesChanged: 'acl::${aclroles}::roles',
  GrantsChanged: 'acl::${aclroles}::grants',
  BindingsChanged: 'acl::${aclroles}::bindings',
} as const;

export const aclEvents = (guild: bigint | string) => ({
  RolesChanged: `acl::${guild}::roles`,
  GrantsChanged: `acl::${guild}::grants`,
  BindingsChanged: `acl::${guild}::bindings`,
});
