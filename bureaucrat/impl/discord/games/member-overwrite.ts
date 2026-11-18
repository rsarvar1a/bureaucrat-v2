import { PermissionsBitField, type Client } from 'discord.js';
import { getGame, listRunningGames } from '../../../drizzle/games';
import { getParticipantByMember, listParticipants } from '../../../drizzle/participants';
import type { Game } from '../../../schema/core/games.sql';
import { logger } from '../../../utilities/logger';
import { recuses } from '../../acl/archetypes';
import { actorOfMember, archetypesFor } from '../access';
import { busyWhispering } from './whispers/restrict';
import { memberOverwrite } from './member-overwrite-rule';

type GameRow = typeof Game.$inferSelect;

/**
 * The one writer of a member's overwrite on the game channel: works out
 * what it should say now from the record and Discord, and writes it only if
 * it differs. Call it after anything that changes either reason, with the
 * rows already written. Needs Manage Roles on the channel; a refusal is
 * logged and the game runs on without it.
 */
export const syncMemberOverwrite = async (client: Client, game: GameRow, member: bigint): Promise<void> => {
  if (game.channel === 0n) return;

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || channel.isDMBased() || channel.isThread()) return;

    const state = (await getGame(game.id))?.state ?? 'completed';
    const participant = await getParticipantByMember(game.id, member);
    const silenced = participant ? await busyWhispering(game.id, participant.id) : false;

    let recused = false;
    if (state !== 'completed' && recuses(participant?.role)) {
      const found = await channel.guild.members.fetch(String(member)).catch(() => null);
      const archetypes = found ? await archetypesFor(game.guild, actorOfMember(found)) : null;
      recused = archetypes !== null && archetypes.moderator && !archetypes.manager;
    }

    const wanted = memberOverwrite(silenced, recused);
    const existing = channel.permissionOverwrites.cache.get(String(member));
    if (!wanted) {
      if (existing) await channel.permissionOverwrites.delete(String(member), `Game: ${game.name}`);
      return;
    }
    if (existing && existing.allow.bitfield === wanted.allow && existing.deny.bitfield === wanted.deny) return;

    const options = Object.fromEntries([
      ...new PermissionsBitField(wanted.allow).toArray().map((flag) => [flag, true]),
      ...new PermissionsBitField(wanted.deny).toArray().map((flag) => [flag, false]),
    ]);
    const why = [silenced ? 'whispering' : null, recused ? 'moderator playing' : null].filter(Boolean).join(', ');
    await channel.permissionOverwrites.create(String(member), options, { reason: `Game: ${game.name} - ${why}` });
  } catch (error) {
    logger.warn({ message: `Could not update the channel overwrite of ${member} in game ${game.id}.`, error });
  }
};

export const syncPlayerOverwrites = async (client: Client, game: GameRow): Promise<void> => {
  for (const player of await listParticipants(game.id, 'Player')) {
    await syncMemberOverwrite(client, game, player.member);
  }
};

/** After the Moderator or Manager roles change: every player of every running game in the server, again. */
export const resyncGuildOverwrites = async (client: Client, guild: bigint): Promise<void> => {
  for (const game of await listRunningGames()) {
    if (game.guild === guild) await syncPlayerOverwrites(client, game);
  }
};
