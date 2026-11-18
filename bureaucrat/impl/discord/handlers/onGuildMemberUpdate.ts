import type { GuildMember, PartialGuildMember } from 'discord.js';
import { listRunningGamesOfPlayer } from '../../../drizzle/games';
import { syncMemberOverwrite } from '../games/member-overwrite';

const sameRoles = (a: GuildMember | PartialGuildMember, b: GuildMember): boolean =>
  a.roles.cache.size === b.roles.cache.size && [...a.roles.cache.keys()].every((id) => b.roles.cache.has(id));

/**
 * A member's roles changed in Discord: whether they are a Moderator, or a
 * Manager, may have changed with them, so the overwrite of every running game
 * they play in is worked out again. An uncached member arrives partial, with
 * no roles to compare, and is synced regardless; the sync writes only when the
 * overwrite would change. Needs the Server Members intent.
 */
export default async function onGuildMemberUpdate(old: GuildMember | PartialGuildMember, member: GuildMember) {
  if (!old.partial && sameRoles(old, member)) return;

  for (const game of await listRunningGamesOfPlayer(BigInt(member.id), BigInt(member.guild.id))) {
    await syncMemberOverwrite(member.client, game, BigInt(member.id));
  }
}
