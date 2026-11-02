import { ButtonStyle } from 'discord.js';
import { text, separator, linear, select, selectRow, button } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { ScriptSummary } from '../../../../../drizzle/scripts';
import type { QueueEntry } from '../../../../../schema/core/queues.sql';
import { SIGNUP_MODES, modeLabel } from '../signup-mode';

type Entry = typeof QueueEntry.$inferSelect;

const DESCRIPTION_LIMIT = 200;

const describe = (description: string | null) => {
  if (!description) return '*No description*';
  return description.length > DESCRIPTION_LIMIT ? description.slice(0, DESCRIPTION_LIMIT) + '…' : description;
};

/** `name.pdf (n pages)`, or how it stands when there is nothing to show. */
export const scriptLine = (script: ScriptSummary | undefined, pages: number) => {
  if (!script?.hasPdf) return 'None';
  const name = script.pdfName ?? 'script.pdf';
  return pages > 0 ? `${name} (${pages} page${pages === 1 ? '' : 's'})` : `${name} (nothing to preview)`;
};

export const renderDetails = (
  entry: Entry,
  script: ScriptSummary | undefined,
  pages: number,
): Parameters<typeof linear> => {
  const startDate = entry.minimumStartDate ? `<t:${Math.floor(entry.minimumStartDate.getTime() / 1000)}:D>` : 'None';

  return [
    text(`### Manage Entry: ${entry.title}`),
    separator(),
    text(
      [
        describe(entry.description),
        '',
        `**Signups:** ${modeLabel(entry.signups)}`,
        `**Minimum Start Date:** ${startDate}`,
        `**Script PDF:** ${scriptLine(script, pages)}`,
      ].join('\n'),
    ),
    separator(),
  ];
};

/** Upload or replace, and remove once there is one: hopefuls preview it from the entry card. */
export const pdfButtons = <S>(view: ViewRow<S>, script: ScriptSummary | undefined) => {
  const id = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);
  return [
    button(id('pdf'), script?.hasPdf ? 'Replace PDF' : 'Upload PDF', ButtonStyle.Secondary),
    ...(script?.hasPdf ? [button(id('pdf-remove'), 'Remove PDF', ButtonStyle.Danger)] : []),
  ];
};

export const signupModeRow = <S>(view: ViewRow<S>, entry: Entry) =>
  selectRow(
    select(view.customId('mode' as Parameters<typeof view.customId>[0]), 'Signups').addOptions(
      SIGNUP_MODES.map((mode) => ({ ...mode, default: mode.value === entry.signups })),
    ),
  );
