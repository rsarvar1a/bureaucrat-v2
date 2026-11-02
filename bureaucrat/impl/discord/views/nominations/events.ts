/**
 * Two labels, so a lock repaints its own card and the day's list, never
 * every card of the day. The day card's route carries the phase id, the
 * nomination card's its nomination id.
 */
export const NominationEvents = {
  DayChanged: 'nominations::${gnomday}::changed',
  Changed: 'nomination::${gnomination}::changed',
} as const;

/** The concrete labels, for publishers outside the cards (the domain, the Phases window). */
export const nominationEvents = (ids: { phase?: string; nomination?: string }) => ({
  ...(ids.phase ? { DayChanged: `nominations::${ids.phase}::changed` } : {}),
  ...(ids.nomination ? { Changed: `nomination::${ids.nomination}::changed` } : {}),
});

export const dayChanged = (phase: string): string => `nominations::${phase}::changed`;
export const nominationChanged = (nomination: string): string => `nomination::${nomination}::changed`;
