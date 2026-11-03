import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../utilities/db';
import { ManagedThread, ManagedThreadParticipant } from '../schema/core/threads.sql';
import { Participant } from '../schema/core/people.sql';

type InsertMembership = typeof ManagedThreadParticipant.$inferInsert;

export const insertThreadMemberships = async (rows: InsertMembership[]) => {
  if (rows.length === 0) return [];
  return db.insert(ManagedThreadParticipant).values(rows).onConflictDoNothing().returning();
};

export const listThreadsOfParticipant = async (participantId: string) =>
  db
    .select({ thread: ManagedThread })
    .from(ManagedThreadParticipant)
    .innerJoin(ManagedThread, eq(ManagedThreadParticipant.thread, ManagedThread.id))
    .where(eq(ManagedThreadParticipant.participant, participantId))
    .orderBy(asc(ManagedThread.createdAt))
    .then((rows) => rows.map((r) => r.thread));

export const listThreadMembers = async (threadId: string) =>
  db
    .select({ participant: Participant })
    .from(ManagedThreadParticipant)
    .innerJoin(Participant, eq(ManagedThreadParticipant.participant, Participant.id))
    .where(eq(ManagedThreadParticipant.thread, threadId))
    .orderBy(asc(Participant.createdAt))
    .then((rows) => rows.map((r) => r.participant));

export const deleteThreadMemberships = async (participantId: string, threadIds: string[]) => {
  if (threadIds.length === 0) return;
  await db
    .delete(ManagedThreadParticipant)
    .where(
      and(eq(ManagedThreadParticipant.participant, participantId), inArray(ManagedThreadParticipant.thread, threadIds)),
    );
};
