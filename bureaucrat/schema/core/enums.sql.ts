import { core } from './.schema.sql';

/**
 * A Role is a capacity in which a user in the server
 * can interact with a game on Bureaucrat.
 */
export const Role = core.enum('Role', ['Player', 'Storyteller', 'Kibitzer']);

/**
 * A GameState is rather self-explanatory.
 */
export const GameState = core.enum('GameState', [
  'signups',
  'running',
  'completed',
]);

/**
 * A player is most often thought of as dead or alive, but
 * a player in the state of having spent their ghost vote
 * is an interesting enough condition to declare as being
 * inherent.
 */
export const PlayerState = core.enum('PlayerState', ['alive', 'dead', 'spent']);

/**
 * Clocktower games have days and nights; we track each one
 * separately so we can attach events to them.
 */
export const PhaseType = core.enum('Phase', ['night', 'day']);
