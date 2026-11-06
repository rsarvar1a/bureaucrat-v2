/**
 * The longest line a table aims for: where Discord was seen to wrap a code
 * block's lines. It does not report the width, so this is measured, not read.
 */
export const TABLE_WIDTH = 64;

const SEPARATOR = ' | ';

export type TableColumn = {
  header: string;
  /** Used instead of `header` when the table would not otherwise fit. */
  short?: string;
  align?: 'left' | 'right';
  /** Marks a free-text column that may be cut, to no narrower than this, when the table would not otherwise fit. */
  minWidth?: number;
};

/**
 * Text that holds a monospace column: printable ASCII only, since Discord does
 * not give an emoji or a wide character one cell, and no backticks, which would
 * end the code block early.
 */
export const asciiCell = (value: string): string =>
  value
    .replace(/[^\x20-\x7e]/g, '')
    .replaceAll('`', "'")
    .replace(/ +/g, ' ')
    .trim();

const fit = (value: string, width: number, align: TableColumn['align']) =>
  align === 'right' ? value.padStart(width) : value.padEnd(width);

const cut = (value: string, width: number) =>
  value.length > width ? `${value.slice(0, width - 2).trimEnd()}..` : value;

/**
 * Each column's header and width within `maxWidth`: short headers first, the
 * biggest saving first, then the free-text columns cut, the widest first. A
 * table that still does not fit is left as narrow as it can go.
 */
const layout = (columns: TableColumn[], cells: string[][], maxWidth: number) => {
  const contents = columns.map((_, i) => Math.max(0, ...cells.map((row) => row[i]!.length)));
  const headers = columns.map((column) => column.header);
  const widths = columns.map((_, i) => Math.max(headers[i]!.length, contents[i]!));
  const total = () => widths.reduce((sum, width) => sum + width, 0) + SEPARATOR.length * (columns.length - 1);

  while (total() > maxWidth) {
    const savings = columns.map((column, i) =>
      column.short === undefined || headers[i] === column.short
        ? 0
        : widths[i]! - Math.max(column.short.length, contents[i]!),
    );
    const best = savings.indexOf(Math.max(...savings));
    if (savings[best]! <= 0) break;
    headers[best] = columns[best]!.short!;
    widths[best] = widths[best]! - savings[best]!;
  }

  const floors = columns.map((column, i) =>
    column.minWidth === undefined ? widths[i]! : Math.max(column.minWidth, headers[i]!.length),
  );
  while (total() > maxWidth) {
    const room = widths.map((width, i) => width - floors[i]!);
    const widest = room.indexOf(Math.max(...room));
    if (room[widest]! <= 0) break;
    widths[widest] = widths[widest]! - 1;
  }

  return { headers, widths };
};

/** An aligned table in a code block: a padded `|` between columns and a rule under the header. */
export const asciiTable = (columns: TableColumn[], rows: string[][], maxWidth = TABLE_WIDTH): string => {
  const cells = rows.map((row) => columns.map((_, i) => asciiCell(row[i] ?? '')));
  const { headers, widths } = layout(columns, cells, maxWidth);

  const line = (row: string[]) =>
    row
      .map((cell, i) => fit(cut(cell, widths[i]!), widths[i]!, columns[i]!.align))
      .join(SEPARATOR)
      .trimEnd();

  return ['```', line(headers), widths.map((width) => '-'.repeat(width)).join('-+-'), ...cells.map(line), '```'].join(
    '\n',
  );
};
