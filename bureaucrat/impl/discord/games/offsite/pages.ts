/**
 * Rows in pages by keyset, so a long channel is never in memory whole. A page
 * shorter than `size` ends it without asking again. Pure, so it is tested alone.
 */
export async function* pagesOf<T>(
  fetch: (after: bigint | null) => Promise<T[]>,
  keyOf: (row: T) => bigint,
  size: number,
): AsyncGenerator<T[]> {
  let after: bigint | null = null;
  for (;;) {
    const page: T[] = await fetch(after);
    if (page.length === 0) return;
    const full = page.length >= size;
    after = keyOf(page[page.length - 1]!);
    yield page;
    if (!full) return;
  }
}
