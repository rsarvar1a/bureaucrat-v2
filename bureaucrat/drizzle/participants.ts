import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Participant } from '../schema/core/people.sql';

type InsertParticipant = typeof Participant.$inferInsert;
type ParticipantRole = InsertParticipant['role'];

export const insertParticipants = async (rows: InsertParticipant[]) => {
  if (rows.length === 0) return [];
  return db.insert(Participant).values(rows).onConflictDoNothing().returning();
};

export const listParticipants = async (gameId: string, role?: ParticipantRole) =>
  db
    .select()
    .from(Participant)
    .where(role ? and(eq(Participant.game, gameId), eq(Participant.role, role)) : eq(Participant.game, gameId))
    .orderBy(asc(Participant.createdAt));

export const isParticipant = async (gameId: string, member: bigint, role?: ParticipantRole) => {
  const [row] = await db
    .select({ id: Participant.id })
    .from(Participant)
    .where(
      and(eq(Participant.game, gameId), eq(Participant.member, member), ...(role ? [eq(Participant.role, role)] : [])),
    )
    .limit(1);
  return row !== undefined;
};

export const insertParticipant = async (row: InsertParticipant) => {
  const [inserted] = await db.insert(Participant).values(row).returning();
  return inserted!;
};

export const getParticipant = async (id: string) => {
  const [row] = await db.select().from(Participant).where(eq(Participant.id, id));
  return row;
};

export const getParticipantByMember = async (gameId: string, member: bigint) => {
  const [row] = await db
    .select()
    .from(Participant)
    .where(and(eq(Participant.game, gameId), eq(Participant.member, member)));
  return row;
};

export const deleteParticipant = async (id: string) => {
  await db.delete(Participant).where(eq(Participant.id, id));
};

export const countParticipants = async (gameId: string, role?: ParticipantRole) => {
  const [row] = await db
    .select({ n: count() })
    .from(Participant)
    .where(role ? and(eq(Participant.game, gameId), eq(Participant.role, role)) : eq(Participant.game, gameId));
  return row?.n ?? 0;
};
