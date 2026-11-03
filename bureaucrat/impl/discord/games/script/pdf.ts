import * as mupdf from 'mupdf';

/** Roughly 108 dpi: readable on a phone, and a page stays well under a megabyte. */
const SCALE = 1.5;

const open = (bytes: Uint8Array) => mupdf.Document.openDocument(bytes, 'application/pdf');

export const pageCount = (bytes: Uint8Array): number => {
  const doc = open(bytes);
  try {
    return doc.countPages();
  } finally {
    doc.destroy();
  }
};

/** Every page as a PNG, in order, or null for an unreadable file. Done once, at upload. */
export const renderAllPages = (bytes: Uint8Array): Uint8Array[] | null => {
  let doc: mupdf.Document;
  try {
    doc = open(bytes);
  } catch {
    return null;
  }

  try {
    const pngs: Uint8Array[] = [];
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.loadPage(index);
      try {
        const pixmap = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
        try {
          pngs.push(pixmap.asPNG());
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return pngs;
  } finally {
    doc.destroy();
  }
};

/** Page `index` (zero-based, clamped) as a PNG, or null for an unreadable file. */
export const renderPage = (
  bytes: Uint8Array,
  index: number,
): { png: Uint8Array; page: number; pages: number } | null => {
  let doc: mupdf.Document;
  try {
    doc = open(bytes);
  } catch {
    return null;
  }

  try {
    const pages = doc.countPages();
    if (pages === 0) return null;

    const page = Math.min(Math.max(0, index), pages - 1);
    const loaded = doc.loadPage(page);
    try {
      const pixmap = loaded.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
      try {
        return { png: pixmap.asPNG(), page, pages };
      } finally {
        pixmap.destroy();
      }
    } finally {
      loaded.destroy();
    }
  } finally {
    doc.destroy();
  }
};
