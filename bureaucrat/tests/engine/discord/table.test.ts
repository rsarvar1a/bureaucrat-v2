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

test('a long cell is cut to its maximum', () => {
  const table = asciiTable([{ header: 'Name', maxWidth: 6 }], [['abcdefghij']]);
  expect(table).toContain('abcd..');
  expect(table).not.toContain('abcde');
});

test('a cell cannot break the alignment or end the block', () => {
  expect(asciiCell('🎮 sam `x` 名')).toBe("sam 'x'");
  expect(asciiCell('2️⃣0️⃣ 🎮 2️⃣')).toBe('20 2');
});

test('a row short of cells still lines up', () => {
  expect(asciiTable([{ header: 'A' }, { header: 'B' }], [['x']])).toContain('x |');
});
