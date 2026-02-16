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
export const Phase = core.enum('Phase', ['night', 'day']);

/**
 * A Thread can be one of the following:
 * - ST thread: a communication between Storytellers and a particular player
 * - KIBITZ: a thread for Storytellers and Kibitzers (spectators)
 * - public: a thread open by default to all players, such as a Rules thread
 * - storyteller: a thread open only to Storytellers, like ST PRIVATE or GRIMOIRES
 * - whisper: a thread open to a particular subset of whispering players, as well as
 *    all Storytellers and any Kibitzers following at least one of the target players
 */
export const ThreadType = core.enum('ThreadType', [
  'storyteller',
  'kibitz',
  'public',
  'ST thread',
  'whisper',
]);
