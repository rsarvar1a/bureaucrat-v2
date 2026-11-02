/**
 * The preview lengths the queue card tries, longest first. A short queue gets
 * generous previews; as it grows, the card steps down the ladder until the
 * message fits, and at the foot the entries are titles alone.
 */
export const LADDER = [240, 210, 180, 165, 150, 140, 120, 100, 80, 60, 40] as const;

/** What a Components V2 message may hold across its text displays, less a margin for the fixed lines. */
export const CARD_BUDGET = 3900;

/**
 * The description as a quote: its line breaks kept, each line carrying the
 * marker so the quote holds, a paragraph gap an empty quoted line, cut at
 * the cap with a marker when it was. A length of zero is no preview at all.
 */
export const preview = (description: string, length: number): string | null => {
  if (length <= 0) return null;
  const tidy = description
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!tidy) return null;
  const cut = tidy.length > length ? `${tidy.slice(0, length).trimEnd()}...` : tidy;
  return cut
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
};

/**
 * The first rung whose rendering fits the budget, or zero when none does.
 * `measure` is the card's text size at a given preview length.
 */
export const fitPreviews = (measure: (length: number) => number, budget = CARD_BUDGET): number =>
  LADDER.find((length) => measure(length) <= budget) ?? 0;
