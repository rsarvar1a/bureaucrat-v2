import { test, expect } from 'bun:test';
import { checklist, renderChecklist } from '../../../impl/discord/views/games/checklist';
import type { SeatedPlayer } from '../../../drizzle/seating';

const seat = (trueRole: string | null): SeatedPlayer => ({ seat: { trueRole } as SeatedPlayer['seat'], member: 1n });

const empty = { script: null, seating: [], unseated: 0, pending: 0 };

test('a fresh game has everything left to do', () => {
  const items = checklist(empty);
  expect(items.map((i) => i.done)).toEqual([false, true, false, false]);
});

test('a script counts whichever way it was given', () => {
  for (const script of [
    { link: 'https://x', jsonName: null, pdfName: null },
    { link: null, jsonName: 'tb.json', pdfName: null },
    { link: null, jsonName: null, pdfName: 'tb.pdf' },
  ]) {
    expect(checklist({ ...empty, script })[0]!.done).toBe(true);
  }
});

test('seating is done only when nobody is left unseated, and roles only when every seat has one', () => {
  expect(checklist({ ...empty, seating: [seat('Chef')], unseated: 1 })[2]!.done).toBe(false);
  expect(checklist({ ...empty, seating: [seat('Chef')], unseated: 0 })[2]!.done).toBe(true);
  expect(checklist({ ...empty, seating: [seat('Chef'), seat(null)] })[3]!.done).toBe(false);
  expect(checklist({ ...empty, seating: [seat('Chef'), seat('Imp')] })[3]!.done).toBe(true);
});

test('pending applications are a task, and name how many', () => {
  const item = checklist({ ...empty, pending: 2 })[1]!;
  expect(item.done).toBe(false);
  expect(item.label).toContain('2 applications');
});

test('the rendering marks each line', () => {
  const out = renderChecklist([
    { done: true, label: 'a' },
    { done: false, label: 'b' },
  ]);
  expect(out).toBe('☑ a\n☐ b');
});
