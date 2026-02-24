/**
 * Parses a string as an integer, returning `null` instead of `NaN` on failure.
 */
export const safeParseInt = (value: string): number | null => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};
