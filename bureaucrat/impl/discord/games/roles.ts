import { PermissionsBitField, type Client, type Guild } from 'discord.js';
import { deleteGameRole, insertGameRole, listGameRoles } from '../../../drizzle/game-roles';
import { listParticipants } from '../../../drizzle/participants';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import type { ParticipantRow } from './membership';

type GameRow = typeof Game.$inferSelect;
export type LogicalRole = ParticipantRow['role'];

export const LOGICAL_ROLES: LogicalRole[] = ['Player', 'Storyteller', 'Kibitzer'];

/** What a game's set of people is called, in a mention or as a role name. */
export const ROLE_LABEL: Record<LogicalRole, string> = {
  Player: 'Players',
  Storyteller: 'Storytellers',
  Kibitzer: 'Kibitzers',
};

const NAME_LIMIT = 100;

export const gameRoleName = (gameName: string, role: LogicalRole): string =>
  `${gameName} ${ROLE_LABEL[role]}`.slice(0, NAME_LIMIT);

/** The game's tracked roles by logical role, for whichever exist. */
export type TrackedRoles = Partial<Record<LogicalRole, bigint>>;

const guildOf = (client: Client, game: GameRow): Promise<Guild | null> =>
  client.guilds.fetch(String(game.guild)).catch(() => null);

export const trackedRoles = async (gameId: string): Promise<TrackedRoles> =>
  Object.fromEntries((await listGameRoles(gameId)).map((row) => [row.role, row.discordRole])) as TrackedRoles;

/** A role mention where the game has the role, its plain name where it does not; `ids` is what `allowedMentions` lets ring. */
export const roleMentions = (roles: LogicalRole[], tracked: TrackedRoles): { text: string[]; ids: string[] } => {
  const ids: string[] = [];
  const text = roles.map((role) => {
    const id = tracked[role];
    if (!id) return `**${ROLE_LABEL[role]}**`;
    ids.push(String(id));
    return `<@&${id}>`;
  });
  return { text, ids };
};

/**
 * One mentionable, permissionless Discord role per logical role, created
 * when missing and re-created when deleted out from under us. Needs Manage
 * Roles; without it every role is skipped, logged once, and the game runs on
 * without mentions.
 */
export const ensureGameRoles = async (client: Client, game: GameRow): Promise<TrackedRoles> => {
  const guild = await guildOf(client, game);
  if (!guild) return {};

  const known = await trackedRoles(game.id);
  const roles: TrackedRoles = {};

  for (const role of LOGICAL_ROLES) {
    const existing = known[role];
    if (existing && (await guild.roles.fetch(String(existing)).catch(() => null))) {
      roles[role] = existing;
      continue;
    }

    try {
      const created = await guild.roles.create({
        name: gameRoleName(game.name, role),
        mentionable: true,
        permissions: new PermissionsBitField(0n),
        reason: `Game: ${game.name}`,
      });
      await insertGameRole({ game: game.id, role, discordRole: BigInt(created.id) });
      roles[role] = BigInt(created.id);
    } catch (error) {
      logger.warn({ message: `Could not create the ${role} role for game ${game.id}.`, error });
    }
  }

  return roles;
};

const setRole = async (
  client: Client,
  game: GameRow,
  participant: ParticipantRow,
  holds: boolean,
  roles?: TrackedRoles,
): Promise<void> => {
  const roleId = (roles ?? (await trackedRoles(game.id)))[participant.role];
  if (!roleId) return;

  const guild = await guildOf(client, game);
  if (!guild) return;

  try {
    const member = await guild.members.fetch(String(participant.member));
    if (holds) await member.roles.add(String(roleId), `Game: ${game.name}`);
    else await member.roles.remove(String(roleId), `Game: ${game.name}`);
  } catch (error) {
    logger.debug({
      message: `Could not ${holds ? 'grant' : 'revoke'} the ${participant.role} role of game ${game.id} for ${participant.member}.`,
      error,
    });
  }
};

/** A participant takes the role for their logical role; a failure is logged, never thrown. */
export const grantGameRole = (client: Client, game: GameRow, participant: ParticipantRow, roles?: TrackedRoles) =>
  setRole(client, game, participant, true, roles);

export const revokeGameRole = (client: Client, game: GameRow, participant: ParticipantRow, roles?: TrackedRoles) =>
  setRole(client, game, participant, false, roles);

/**
 * Kibitzers see every private thread of the game: ST threads, whispers, the
 * Storytellers' own. Discord shows private threads to whoever may manage
 * threads in the channel, and that is the only permission that does, so the
 * Kibitzers' role gets Manage Threads on the game channel alone. Needs Manage
 * Roles on the channel; a refusal is logged and the game runs on.
 */
export const grantKibitzerSight = async (client: Client, game: GameRow, roles: TrackedRoles): Promise<void> => {
  const roleId = roles.Kibitzer;
  if (!roleId || game.channel === 0n) return;

  try {
    const channel = await client.channels.fetch(String(game.channel));
    if (!channel || channel.isDMBased() || channel.isThread()) return;
    await channel.permissionOverwrites.edit(
      String(roleId),
      { ManageThreads: true, ViewChannel: true, ReadMessageHistory: true },
      { reason: `Game: ${game.name} - Kibitzers see every thread` },
    );
  } catch (error) {
    logger.warn({ message: `Could not let the Kibitzers of game ${game.id} see its private threads.`, error });
  }
};

/** Every participant wears the role for their logical role: the roles made and granted in one pass. */
export const syncGameRoles = async (client: Client, game: GameRow): Promise<void> => {
  const roles = await ensureGameRoles(client, game);
  await grantKibitzerSight(client, game, roles);
  for (const participant of await listParticipants(game.id)) await grantGameRole(client, game, participant, roles);
};

/** The roles go with the game; a role already gone is simply forgotten. */
export const deleteGameRoles = async (client: Client, game: GameRow): Promise<void> => {
  const guild = await guildOf(client, game);

  for (const row of await listGameRoles(game.id)) {
    try {
      const role = guild ? await guild.roles.fetch(String(row.discordRole)).catch(() => null) : null;
      if (role) await role.delete('Game ended');
    } catch (error) {
      logger.warn({ message: `Could not delete the ${row.role} role of game ${game.id}.`, error });
    }
    await deleteGameRole(game.id, row.role);
  }
};
