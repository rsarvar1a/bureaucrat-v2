import { test, expect } from 'bun:test';
import { pageCount, renderAllPages, renderPage } from '../../../impl/discord/games/script/pdf';

// The smallest two-page PDF that opens: no xref table, which mupdf repairs.
const TWO_PAGES = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >> endobj
trailer << /Root 1 0 R >>`);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

test('counts pages', () => {
  expect(pageCount(TWO_PAGES)).toBe(2);
});

test('renders a page as PNG and clamps the index to the document', () => {
  const first = renderPage(TWO_PAGES, 0)!;
  expect([...first.png.slice(0, 4)]).toEqual(PNG_MAGIC);
  expect(first).toMatchObject({ page: 0, pages: 2 });

  expect(renderPage(TWO_PAGES, 99)!.page).toBe(1);
  expect(renderPage(TWO_PAGES, -3)!.page).toBe(0);
});

test('renders every page in order', () => {
  const pages = renderAllPages(TWO_PAGES)!;
  expect(pages).toHaveLength(2);
  for (const png of pages) expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
});

test('an unreadable file renders nothing', () => {
  expect(renderPage(Buffer.from('not a pdf at all'), 0)).toBeNull();
  expect(renderAllPages(Buffer.from('not a pdf at all'))).toBeNull();
});
