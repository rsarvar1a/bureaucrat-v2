import type { Role } from 'discord.js';
import { resyncGuildOverwrites } from '../games/member-overwrite';

/**
 * A role's permissions changed: Manage Server or Administrator granted or
 * taken makes or unmakes Managers, who keep Manage Threads where a playing
 * Moderator loses it. Every player of the server's running games is synced.
 */
export default async function onGuildRoleUpdate(old: Role, role: Role) {
  if (old.permissions.bitfield === role.permissions.bitfield) return;
  await resyncGuildOverwrites(role.client, BigInt(role.guild.id));
}
