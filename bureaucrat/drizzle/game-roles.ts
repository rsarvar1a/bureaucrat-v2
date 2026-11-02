import { and, eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GameRole } from '../schema/core/roles.sql';

type InsertGameRole = typeof GameRole.$inferInsert;

export type GameRoleRow = typeof GameRole.$inferSelect;

export const insertGameRole = async (row: InsertGameRole) => {
  const [inserted] = await db
    .insert(GameRole)
    .values(row)
    .onConflictDoUpdate({ target: [GameRole.game, GameRole.role], set: { discordRole: row.discordRole } })
    .returning();
  return inserted!;
};

export const listGameRoles = async (gameId: string) => db.select().from(GameRole).where(eq(GameRole.game, gameId));

export const deleteGameRole = async (gameId: string, role: GameRoleRow['role']) => {
  await db.delete(GameRole).where(and(eq(GameRole.game, gameId), eq(GameRole.role, role)));
};
