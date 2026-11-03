/**
 * Two forms of the same labels.
 *
 * `GameEvents` holds **templates** for `subscribesTo` and for publishers
 * inside the game's window stack. Every window descends from `gconfig`, the
 * header, whose `entityId` is the game, so the key is that route rather than
 * `game` - nothing in ancestry would ever supply a `${game}`.
 *
 * `gameEvents(id)` holds the **concrete** labels for a publisher outside the
 * stack: the end command, a queue claim, a sweep.
 */
export const GameEvents = {
  Changed: 'game::${gconfig}::changed',
  /** The Storytellers published the seating; the players' square repaints. */
  Published: 'game::${gconfig}::published',
  Ended: 'game::${gconfig}::ended',
} as const;

export const gameEvents = (game: string) => ({
  Changed: `game::${game}::changed`,
  Published: `game::${game}::published`,
  Ended: `game::${game}::ended`,
});
