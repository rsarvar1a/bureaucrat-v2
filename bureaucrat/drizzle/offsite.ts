import { and, asc, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { OffsiteDestination, OffsiteSource } from '../schema/core/offsite.sql';

export type OffsiteDestinationRow = typeof OffsiteDestination.$inferSelect;
export type OffsiteSourceRow = typeof OffsiteSource.$inferSelect;

type DestinationPatch = Partial<Pick<OffsiteDestinationRow, 'category' | 'reflowPending'>>;

export const getDestination = async (id: string): Promise<OffsiteDestinationRow | undefined> => {
  const [row] = await db.select().from(OffsiteDestination).where(eq(OffsiteDestination.id, id));
  return row;
};

/** A guild's destinations, mapped or not; the oldest first. */
export const listDestinations = async (guild: bigint): Promise<OffsiteDestinationRow[]> =>
  db
    .select()
    .from(OffsiteDestination)
    .where(eq(OffsiteDestination.guild, guild))
    .orderBy(asc(OffsiteDestination.createdAt));

export const insertDestination = async (row: {
  guild: bigint;
  destGuild: bigint;
  category: bigint;
}): Promise<OffsiteDestinationRow> => {
  const [inserted] = await db.insert(OffsiteDestination).values(row).returning();
  return inserted!;
};

export const updateDestination = async (id: string, patch: DestinationPatch): Promise<void> => {
  await db
    .update(OffsiteDestination)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(OffsiteDestination.id, id));
};

/** Destinations owed a reflow once the offsite queue is empty. */
export const listDestinationsAwaitingReflow = async (): Promise<OffsiteDestinationRow[]> =>
  db.select().from(OffsiteDestination).where(eq(OffsiteDestination.reflowPending, true));

/** A guild's mappings, the oldest first: the order a channel's family is looked for in. */
export const listSources = async (guild: bigint): Promise<OffsiteSourceRow[]> =>
  db.select().from(OffsiteSource).where(eq(OffsiteSource.guild, guild)).orderBy(asc(OffsiteSource.createdAt));

export const getSource = async (id: string): Promise<OffsiteSourceRow | undefined> => {
  const [row] = await db.select().from(OffsiteSource).where(eq(OffsiteSource.id, id));
  return row;
};

export const insertSource = async (row: {
  guild: bigint;
  category: bigint;
  destination: string;
}): Promise<OffsiteSourceRow> => {
  const [inserted] = await db.insert(OffsiteSource).values(row).returning();
  return inserted!;
};

export const setSourceDestination = async (id: string, destination: string): Promise<void> => {
  await db.update(OffsiteSource).set({ destination, updatedAt: new Date() }).where(eq(OffsiteSource.id, id));
};

export const deleteSource = async (guild: bigint, id: string): Promise<void> => {
  await db.delete(OffsiteSource).where(and(eq(OffsiteSource.guild, guild), eq(OffsiteSource.id, id)));
};
