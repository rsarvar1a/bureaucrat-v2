export type TableColumn = {
  header: string;
  align?: 'left' | 'right';
  /** Longer cells are cut to this, for a free-text column that would widen every row. */
  maxWidth?: number;
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

const cut = (value: string, maxWidth: number | undefined) =>
  maxWidth !== undefined && value.length > maxWidth ? `${value.slice(0, maxWidth - 2).trimEnd()}..` : value;

/** An aligned table in a code block: a padded `|` between columns and a rule under the header. */
export const asciiTable = (columns: TableColumn[], rows: string[][]): string => {
  const cells = rows.map((row) => columns.map((column, i) => cut(asciiCell(row[i] ?? ''), column.maxWidth)));
  const widths = columns.map((column, i) => Math.max(column.header.length, ...cells.map((row) => row[i]!.length)));

  const line = (row: string[]) =>
    row
      .map((cell, i) => fit(cell, widths[i]!, columns[i]!.align))
      .join(' | ')
      .trimEnd();

  return [
    '```',
    line(columns.map((column) => column.header)),
    widths.map((width) => '-'.repeat(width)).join('-+-'),
    ...cells.map(line),
    '```',
  ].join('\n');
};
