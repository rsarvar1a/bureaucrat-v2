export const safeParseInt = (value: string): number | null => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};
