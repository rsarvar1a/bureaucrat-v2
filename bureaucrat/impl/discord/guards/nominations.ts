import { getPhase } from '../../../drizzle/game-phases';
import { getNomination } from '../../../drizzle/nominations';
import { storytellsVia, type GameOf } from './game';

/** The nomination card and its console carry the nomination as their entity. */
export const gameOfNomination: GameOf = async (ctx) =>
  ctx.view.entityId ? (await getNomination(ctx.view.entityId))?.game : null;

/** The day card carries the phase. */
export const gameOfPhase: GameOf = async (ctx) =>
  ctx.view.entityId ? (await getPhase(ctx.view.entityId))?.game : null;

export const storytellsNomination = storytellsVia(gameOfNomination);
export const storytellsDay = storytellsVia(gameOfPhase);
