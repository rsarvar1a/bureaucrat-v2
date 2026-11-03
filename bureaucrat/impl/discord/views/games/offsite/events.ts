/**
 * The progress card's label, in both forms (see `../events.ts`): the
 * template for its own subscription, the concrete label for the engine,
 * which publishes from outside any view.
 */
export const OffsiteEvents = {
  Changed: 'offsite::${goffsite}::changed',
} as const;

export const offsiteEvents = (game: string) => ({
  Changed: `offsite::${game}::changed`,
});
