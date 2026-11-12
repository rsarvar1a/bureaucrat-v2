import { eq } from 'drizzle-orm';
import { db } from '../utilities/db';
import { GuildSettings } from '../schema/core/guilds.sql';

type InsertGuildSettings = typeof GuildSettings.$inferInsert;

/** A guild's settings row, made with the defaults the first time anybody looks. */
export const getOrCreateGuildSettings = async (guild: bigint) => {
  const [existing] = await db.select().from(GuildSettings).where(eq(GuildSettings.guild, guild));
  if (existing) return existing;

  const [row] = await db.insert(GuildSettings).values({ guild }).onConflictDoNothing().returning();
  if (row) return row;

  // Lost a race with another first reader; theirs is the row.
  const [theirs] = await db.select().from(GuildSettings).where(eq(GuildSettings.guild, guild));
  return theirs!;
};

export const updateGuildSettings = async (guild: bigint, patch: Partial<Omit<InsertGuildSettings, 'guild'>>) => {
  await getOrCreateGuildSettings(guild);
  const [row] = await db.update(GuildSettings).set(patch).where(eq(GuildSettings.guild, guild)).returning();
  return row!;
};

/** The archetype roles (`impl/acl/archetypes.ts`), as the access cache keeps them. */
export const getAccessConfig = async (guild: bigint) => {
  const row = await getOrCreateGuildSettings(guild);
  return {
    manager: row.managerRoles,
    moderator: row.moderatorRoles,
    storyteller: row.storytellerRoles,
    player: row.playerRoles,
  };
};
