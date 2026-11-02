import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../utilities/db';
import { Whisper, WhisperParticipant } from '../schema/core/whispers.sql';
import { Participant } from '../schema/core/people.sql';
import { ManagedThread } from '../schema/core/threads.sql';

export type WhisperRow = typeof Whisper.$inferSelect;
type InsertWhisper = typeof Whisper.$inferInsert;
export type WhisperMember = {
  part: typeof WhisperParticipant.$inferSelect;
  participant: typeof Participant.$inferSelect;
};

/** A whisper and its participants in one transaction, the initiator already accepted. */
export const insertWhisper = async (
  whisper: Omit<InsertWhisper, 'id'>,
  participants: { participant: string; cost: number; accepted: boolean | null }[],
): Promise<WhisperRow> =>
  db.transaction(async (tx) => {
    const [row] = await tx.insert(Whisper).values(whisper).returning();
    await tx
      .insert(WhisperParticipant)
      .values(participants.map((p) => ({ ...p, game: whisper.game, whisper: row!.id })));
    return row!;
  });

export const getWhisper = async (id: string) => {
  const [row] = await db.select().from(Whisper).where(eq(Whisper.id, id));
  return row;
};

export const updateWhisper = async (id: string, patch: Partial<Omit<InsertWhisper, 'id' | 'game'>>) => {
  const [row] = await db.update(Whisper).set(patch).where(eq(Whisper.id, id)).returning();
  return row;
};

/** Who is in a whisper, initiator first by the order they were written. */
export const listWhisperMembers = async (whisperId: string): Promise<WhisperMember[]> =>
  db
    .select({ part: WhisperParticipant, participant: Participant })
    .from(WhisperParticipant)
    .innerJoin(Participant, eq(WhisperParticipant.participant, Participant.id))
    .where(eq(WhisperParticipant.whisper, whisperId))
    .orderBy(asc(WhisperParticipant.createdAt));

export const answerWhisper = async (whisperId: string, participantId: string, accepted: boolean) => {
  await db
    .update(WhisperParticipant)
    .set({ accepted })
    .where(and(eq(WhisperParticipant.whisper, whisperId), eq(WhisperParticipant.participant, participantId)));
};

/** Who ended their part; a member already out is left as they were. */
export const endMember = async (whisperId: string, participantId: string): Promise<boolean> => {
  const rows = await db
    .update(WhisperParticipant)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(WhisperParticipant.whisper, whisperId),
        eq(WhisperParticipant.participant, participantId),
        isNull(WhisperParticipant.endedAt),
      ),
    )
    .returning({ id: WhisperParticipant.id });
  return rows.length > 0;
};

export const endAllMembers = async (whisperId: string) => {
  await db
    .update(WhisperParticipant)
    .set({ endedAt: new Date() })
    .where(and(eq(WhisperParticipant.whisper, whisperId), isNull(WhisperParticipant.endedAt)));
};

/** Opens a promotion request: nobody has answered but the one asking. */
export const setPromotion = async (whisperId: string, askerId: string) =>
  db.transaction(async (tx) => {
    await tx.update(WhisperParticipant).set({ promote: null }).where(eq(WhisperParticipant.whisper, whisperId));
    await tx
      .update(WhisperParticipant)
      .set({ promote: true })
      .where(and(eq(WhisperParticipant.whisper, whisperId), eq(WhisperParticipant.participant, askerId)));
    const [row] = await tx.update(Whisper).set({ promoting: true }).where(eq(Whisper.id, whisperId)).returning();
    return row;
  });

export const answerPromotion = async (whisperId: string, participantId: string, promote: boolean) => {
  await db
    .update(WhisperParticipant)
    .set({ promote })
    .where(and(eq(WhisperParticipant.whisper, whisperId), eq(WhisperParticipant.participant, participantId)));
};

/** What a participant has spent on a day: every whisper they are in that opened, by cost; ending one refunds nothing. */
export const spentOn = async (
  gameId: string,
  participantId: string,
  day: number,
): Promise<{ total: number; async: number }> => {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${WhisperParticipant.cost}), 0)::int`,
      async: sql<number>`coalesce(sum(case when ${Whisper.async} then ${WhisperParticipant.cost} else 0 end), 0)::int`,
    })
    .from(WhisperParticipant)
    .innerJoin(Whisper, eq(WhisperParticipant.whisper, Whisper.id))
    .where(
      and(
        eq(Whisper.game, gameId),
        eq(Whisper.day, day),
        inArray(Whisper.state, ['accepted', 'ended']),
        eq(WhisperParticipant.participant, participantId),
      ),
    );
  return row ?? { total: 0, async: 0 };
};

export type OpenWhisper = { whisper: WhisperRow; thread: typeof ManagedThread.$inferSelect; members: WhisperMember[] };

/** The open whispers a participant is in, oldest first, each with its thread and everyone in it. */
export const listOpenWhispersOf = async (gameId: string, participantId: string): Promise<OpenWhisper[]> => {
  const rows = await db
    .select({ whisper: Whisper, thread: ManagedThread })
    .from(Whisper)
    .innerJoin(WhisperParticipant, eq(WhisperParticipant.whisper, Whisper.id))
    .innerJoin(ManagedThread, eq(Whisper.thread, ManagedThread.id))
    .where(
      and(eq(Whisper.game, gameId), eq(Whisper.state, 'accepted'), eq(WhisperParticipant.participant, participantId)),
    )
    .orderBy(asc(Whisper.createdAt));
  if (rows.length === 0) return [];

  const members = await db
    .select({ part: WhisperParticipant, participant: Participant })
    .from(WhisperParticipant)
    .innerJoin(Participant, eq(WhisperParticipant.participant, Participant.id))
    .where(
      inArray(
        WhisperParticipant.whisper,
        rows.map((r) => r.whisper.id),
      ),
    )
    .orderBy(asc(WhisperParticipant.createdAt));

  return rows.map((r) => ({ ...r, members: members.filter((m) => m.part.whisper === r.whisper.id) }));
};

/** Every whisper of the game still waiting or open, with its members: what a night closes. */
export const listOpenWhispers = async (
  gameId: string,
): Promise<{ whisper: WhisperRow; members: WhisperMember[] }[]> => {
  const rows = await db
    .select()
    .from(Whisper)
    .where(and(eq(Whisper.game, gameId), inArray(Whisper.state, ['pending', 'accepted'])))
    .orderBy(asc(Whisper.createdAt));
  if (rows.length === 0) return [];

  const members = await db
    .select({ part: WhisperParticipant, participant: Participant })
    .from(WhisperParticipant)
    .innerJoin(Participant, eq(WhisperParticipant.participant, Participant.id))
    .where(
      inArray(
        WhisperParticipant.whisper,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(WhisperParticipant.createdAt));

  return rows.map((whisper) => ({ whisper, members: members.filter((m) => m.part.whisper === whisper.id) }));
};

/** The newest whisper a thread has held, whatever became of it: what the thread is for. */
export const getLatestWhisperOfThread = async (threadRowId: string) => {
  const [row] = await db
    .select()
    .from(Whisper)
    .where(eq(Whisper.thread, threadRowId))
    .orderBy(desc(Whisper.createdAt))
    .limit(1);
  return row;
};

/** The open whisper held in a thread: threads are shared by participant set, so the newest accepted one is it. */
export const getOpenWhisperOfThread = async (threadRowId: string) => {
  const [row] = await db
    .select()
    .from(Whisper)
    .where(and(eq(Whisper.thread, threadRowId), eq(Whisper.state, 'accepted')))
    .orderBy(desc(Whisper.createdAt))
    .limit(1);
  return row;
};
