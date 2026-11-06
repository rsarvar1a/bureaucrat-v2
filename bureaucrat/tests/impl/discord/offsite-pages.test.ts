import { expect, test } from 'bun:test';
import { pagesOf } from '../../../impl/discord/games/offsite/pages';

const source = (keys: bigint[]) => {
  const asked: (bigint | null)[] = [];
  const fetch = (size: number) => (after: bigint | null) => {
    asked.push(after);
    return Promise.resolve(keys.filter((key) => after === null || key > after).slice(0, size));
  };
  return { asked, fetch };
};

const collect = async (keys: bigint[], size: number) => {
  const { asked, fetch } = source(keys);
  const pages: bigint[][] = [];
  for await (const page of pagesOf(fetch(size), (key) => key, size)) pages.push(page);
  return { asked, pages };
};

test('every row arrives once, in order, each page from after the last', async () => {
  const { asked, pages } = await collect([1n, 2n, 3n, 4n, 5n], 2);
  expect(pages).toEqual([[1n, 2n], [3n, 4n], [5n]]);
  expect(asked).toEqual([null, 2n, 4n]);
});

test('a short page ends it without another query', async () => {
  const { asked } = await collect([1n, 2n, 3n], 5);
  expect(asked).toEqual([null]);
});

test('an exact multiple asks once more and yields no empty page', async () => {
  const { asked, pages } = await collect([1n, 2n, 3n, 4n], 2);
  expect(pages).toEqual([
    [1n, 2n],
    [3n, 4n],
  ]);
  expect(asked).toEqual([null, 2n, 4n]);
});

test('nothing to copy yields nothing', async () => {
  const { pages } = await collect([], 2);
  expect(pages).toEqual([]);
});

test('a page abandoned partway stops the fetching', async () => {
  const { asked, fetch } = source([1n, 2n, 3n, 4n]);
  for await (const page of pagesOf(fetch(2), (key) => key, 2)) {
    expect(page).toEqual([1n, 2n]);
    break;
  }
  expect(asked).toEqual([null]);
});
