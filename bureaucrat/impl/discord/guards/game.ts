import type { ViewContext, ViewGuard } from '../../../engine/discord/views/types';
import { getGame } from '../../../drizzle/games';
import { getParticipantByMember } from '../../../drizzle/participants';
import { getSignupByMember } from '../../../drizzle/signups';
import { recuses } from '../../acl/archetypes';
import { Permissions } from '../../acl/permissions';
import { accessAllows, actorOf, archetypesFor, type Actor } from '../access';
import { inSameGuild } from './scope';
import type { Locator } from './index';
import { S } from '../../../strings';
import type { Game } from '../../../schema/core/games.sql';

type GameRow = typeof Game.$inferSelect;

/** The game a window is bound to: the header and everything beneath it. */
export const gameFromEntity: Locator = async (ctx) => {
  const gameId = ctx.view.entityId;
  if (!gameId) return null;

  const game = await getGame(gameId);

  return game ? { domain: 'game', id: game.id, guild: game.guild } : null;
};

/**
 * A Storyteller of the game may run it; so may a Manager, and a Moderator
 * (`game.manage`) unless they are a Player in it or have asked to be
 * (`recuses`). Shared by the window guard and the commands that act on a game
 * found by channel, so the two never disagree about who storytells.
 */
export const isStorytellerOf = async (game: GameRow, actor: Actor): Promise<boolean> => {
  const seat = await getParticipantByMember(game.id, actor.id);
  if (seat?.role === 'Storyteller') return true;
  if (recuses(seat?.role ?? (await getSignupByMember(game.id, actor.id))?.role)) {
    return (await archetypesFor(game.guild, actor)).manager;
  }

  const verdict = await accessAllows(game.guild, actor, Permissions.Game.Manage);
  return verdict.ok;
};

export const storytells: ViewGuard = async (interaction, ctx) => {
  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;

  const game = ctx.view.entityId ? await getGame(ctx.view.entityId) : undefined;
  if (!game || !inSameGuild(game.guild, interaction.guildId)) return S.errors.notHere;

  return (await isStorytellerOf(game, actor)) ? true : S.errors.notGameStoryteller;
};

/** How a view that is not bound to a game finds its game: by a nomination, a phase, or whatever it holds. */
export type GameOf = (ctx: ViewContext<unknown>) => Promise<string | null | undefined>;

/** `storytells` for a view whose entity is not the game itself. */
export const storytellsVia =
  (gameOf: GameOf): ViewGuard =>
  async (interaction, ctx) => {
    const actor = actorOf(interaction);
    if (actor === null) return S.errors.guildOnly;

    const gameId = await gameOf(ctx);
    const game = gameId ? await getGame(gameId) : undefined;
    if (!game || !inSameGuild(game.guild, interaction.guildId)) return S.errors.notHere;

    return (await isStorytellerOf(game, actor)) ? true : S.errors.notGameStoryteller;
  };
