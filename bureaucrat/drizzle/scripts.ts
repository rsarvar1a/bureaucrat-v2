import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Script, ScriptPage } from '../schema/core/scripts.sql';

type InsertScript = typeof Script.$inferInsert;
type ScriptPatch = Partial<Omit<InsertScript, 'id' | 'game' | 'entry'>>;

// Everything but the PDF bytes: what a window shows on every re-render.
const summary = {
  id: Script.id,
  game: Script.game,
  name: Script.name,
  author: Script.author,
  link: Script.link,
  json: Script.json,
  jsonName: Script.jsonName,
  pdfName: Script.pdfName,
  nights: Script.nights,
  nightsName: Script.nightsName,
  hasPdf: sql<boolean>`${isNotNull(Script.pdf)}`,
  pdfSize: sql<number | null>`octet_length(${Script.pdf})`,
};

export const getScriptSummary = async (gameId: string) => {
  const [row] = await db.select(summary).from(Script).where(eq(Script.game, gameId));
  return row;
};

export type ScriptSummary = NonNullable<Awaited<ReturnType<typeof getScriptSummary>>>;

export const getScript = async (gameId: string) => {
  const [row] = await db.select().from(Script).where(eq(Script.game, gameId));
  return row;
};

export const upsertScript = async (gameId: string, patch: ScriptPatch) => {
  const [row] = await db
    .insert(Script)
    .values({ game: gameId, ...patch })
    .onConflictDoUpdate({ target: Script.game, set: patch })
    .returning();
  return row!;
};

export const deleteScript = async (gameId: string) => {
  await db.delete(Script).where(eq(Script.game, gameId));
};

export const getScriptSummaryById = async (scriptId: string) => {
  const [row] = await db.select(summary).from(Script).where(eq(Script.id, scriptId));
  return row;
};

/** The PDF itself, for a pane that offers the download. */
export const getScriptPdfById = async (scriptId: string) => {
  const [row] = await db
    .select({ pdf: Script.pdf, pdfName: Script.pdfName })
    .from(Script)
    .where(eq(Script.id, scriptId));
  return row?.pdf ? { pdf: row.pdf, pdfName: row.pdfName } : null;
};

export const getEntryScriptSummary = async (entryId: string) => {
  const [row] = await db.select(summary).from(Script).where(eq(Script.entry, entryId));
  return row;
};

export const upsertEntryScript = async (entryId: string, patch: ScriptPatch) => {
  const [row] = await db
    .insert(Script)
    .values({ entry: entryId, ...patch })
    .onConflictDoUpdate({ target: Script.entry, set: patch })
    .returning();
  return row!;
};

export const deleteEntryScript = async (entryId: string) => {
  await db.delete(Script).where(eq(Script.entry, entryId));
};

/** The entry's script becomes the game's: the row moves, pages and all. */
export const adoptEntryScript = async (entryId: string, gameId: string) => {
  await db.update(Script).set({ game: gameId, entry: null }).where(eq(Script.entry, entryId));
};

/** The rendered pages, replaced wholesale: a new PDF never shares pages with the old. */
export const replaceScriptPages = async (scriptId: string, pngs: Uint8Array[]) => {
  await db.transaction(async (tx) => {
    await tx.delete(ScriptPage).where(eq(ScriptPage.script, scriptId));
    if (pngs.length > 0) {
      await tx.insert(ScriptPage).values(pngs.map((png, page) => ({ script: scriptId, page, png: Buffer.from(png) })));
    }
  });
};

export const deleteScriptPages = async (scriptId: string) => {
  await db.delete(ScriptPage).where(eq(ScriptPage.script, scriptId));
};

export const countScriptPages = async (scriptId: string) => {
  const [row] = await db.select({ n: count() }).from(ScriptPage).where(eq(ScriptPage.script, scriptId));
  return row?.n ?? 0;
};

/** One page of a script by index, clamped to what was rendered, with the count beside it. */
export const getScriptPage = async (scriptId: string, index: number) => {
  const pages = await countScriptPages(scriptId);
  if (pages === 0) return null;

  const page = Math.min(Math.max(0, index), pages - 1);
  const [row] = await db
    .select({ png: ScriptPage.png })
    .from(ScriptPage)
    .where(and(eq(ScriptPage.script, scriptId), eq(ScriptPage.page, page)))
    .orderBy(asc(ScriptPage.page));

  return row ? { png: row.png, page, pages } : null;
};
