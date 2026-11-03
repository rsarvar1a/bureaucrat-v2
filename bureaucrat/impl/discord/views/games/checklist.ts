import type { SeatedPlayer } from '../../../../drizzle/seating';

export type ChecklistInput = {
  script: { link: string | null; jsonName: string | null; pdfName: string | null } | null | undefined;
  seating: SeatedPlayer[];
  unseated: number;
  pending: number;
};

export type Item = { done: boolean; label: string };

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** What is left before Start, in the order a Storyteller would do it. */
export const checklist = ({ script, seating, unseated, pending }: ChecklistInput): Item[] => {
  const hasScript = !!(script?.link || script?.jsonName || script?.pdfName);
  const unassigned = seating.filter((row) => !row.seat.trueRole).length;

  return [
    { done: hasScript, label: hasScript ? 'Script set' : 'Set the script (Configuration → Script)' },
    {
      done: pending === 0,
      label: pending === 0 ? 'No applications waiting' : `Answer ${plural(pending, 'application')} (Signups)`,
    },
    {
      done: seating.length > 0 && unseated === 0,
      label:
        seating.length === 0
          ? 'Seat the players (Seating)'
          : unseated === 0
            ? `${plural(seating.length, 'player')} seated`
            : `Seat ${plural(unseated, 'remaining player')} (Seating)`,
    },
    {
      done: seating.length > 0 && unassigned === 0,
      label:
        seating.length === 0
          ? 'Assign roles once seated'
          : unassigned === 0
            ? 'Every seat has a role'
            : `Assign ${plural(unassigned, 'role')} (Seating)`,
    },
  ];
};

export const renderChecklist = (items: Item[]): string =>
  items.map((item) => `${item.done ? '☑' : '☐'} ${item.label}`).join('\n');
