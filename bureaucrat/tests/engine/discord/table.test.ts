import { test, expect } from 'bun:test';
import { asciiCell, asciiTable } from '../../../engine/discord/table';

test('columns line up under a rule, in a code block', () => {
  const table = asciiTable(
    [{ header: 'Name' }, { header: 'N', align: 'right' }],
    [
      ['ann', '5'],
      ['robert', '10'],
    ],
  );
  expect(table).toBe(['```', 'Name   |  N', '-------+---', 'ann    |  5', 'robert | 10', '```'].join('\n'));
});

const wide = () => [
  { header: 'Name', minWidth: 6 },
  { header: 'Long header', short: 'LH', align: 'right' as const },
  { header: 'Longer header here', short: 'LHH', align: 'right' as const },
];
const lines = (table: string) => table.split('\n').slice(1, -1);

test('a table that fits keeps its full headers and names', () => {
  const table = asciiTable(wide(), [['abcdefghij', '1', '2']], 100);
  expect(table).toContain('Long header');
  expect(table).toContain('Longer header here');
  expect(table).toContain('abcdefghij');
});

test('only as many headers shorten as it takes, the biggest saving first', () => {
  const table = asciiTable(wide(), [['abcdefghij', '1', '2']], 35);
  expect(table).toContain('LHH');
  expect(table).toContain('Long header');
  expect(table).toContain('abcdefghij');
});

test('a name is cut only once every header is short, and only as far as it takes', () => {
  const table = asciiTable(wide(), [['abcdefghijklmnop', '1', '2']], 23);
  const [head, , row] = lines(table);
  expect(head).toContain('LH');
  expect(head).toContain('LHH');
  expect(row!.length).toBe(23);
  expect(row).toContain('abcdefghij..');
});

test('a name is never cut below its minimum, even if the table then runs over', () => {
  const table = asciiTable(wide(), [['abcdefghijklmnop', '1', '2']], 5);
  expect(lines(table)[2]).toContain('abcd.. |');
});

test('a short header cannot go narrower than its cells', () => {
  const table = asciiTable([{ header: 'Messages', short: 'M', align: 'right' }], [['130,498']], 3);
  expect(lines(table)).toEqual(['      M', '-------', '130,498']);
});

test('a cell cannot break the alignment or end the block', () => {
  expect(asciiCell('🎮 sam `x` 名')).toBe("sam 'x'");
  expect(asciiCell('2️⃣0️⃣ 🎮 2️⃣')).toBe('20 2');
});

test('a row short of cells still lines up', () => {
  expect(asciiTable([{ header: 'A' }, { header: 'B' }], [['x']])).toContain('x |');
});
