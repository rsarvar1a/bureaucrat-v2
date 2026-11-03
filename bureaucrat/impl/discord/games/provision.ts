import { ChannelType, ThreadAutoArchiveDuration, type Client, type TextChannel, type ThreadChannel } from 'discord.js';
import { updateGame } from '../../../drizzle/games';
import { insertManagedThread } from '../../../drizzle/managed-threads';
import { joinThreads, type ParticipantRow } from './membership';
import { logger } from '../../../utilities/logger';
import type { Game } from '../../../schema/core/games.sql';
import { channelName, THREAD_NAMES } from './names';

type GameRow = typeof Game.$inferSelect;

export type CoreThreads = { storyteller: ThreadChannel; config: ThreadChannel; kibitz: ThreadChannel };

export type Provisioned = { channel: TextChannel; threads: CoreThreads };

type Members = { storytellers: ParticipantRow[]; kibitzers: ParticipantRow[] };

/**
 * The Discord side of a new game: its channel and the three private threads
 * every game opens with.
 *
 * The channel itself is ordinary - the public threads a game runs in live
 * there later - and privacy comes from the threads: a private thread is
 * invisible to anyone not added to it, so no overwrites are needed yet.
 * Storytellers go into all three; kibitzers into KIBITZ only.
 *
 * Not atomic. A refusal part way (the bot lacking a permission, usually) can
 * leave a channel behind, which is logged with its id so somebody can tidy it;
 * the caller drops the game row. Needs Manage Channels, Create Private
 * Threads, Manage Threads and Send Messages in Threads in the category.
 */
export const provisionGame = async (
  client: Client,
  game: GameRow,
  members: Members,
  category: bigint | null,
): Promise<Provisioned> => {
  const guild = await client.guilds.fetch(String(game.guild));

  const channel = await guild.channels.create({
    name: channelName(game.name),
    type: ChannelType.GuildText,
    ...(category ? { parent: String(category) } : {}),
    reason: `Game: ${game.name}`,
  });

  try {
    const thread = (kind: keyof typeof THREAD_NAMES) =>
      channel.threads.create({
        name: THREAD_NAMES[kind],
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Game: ${game.name}`,
      });

    const threads: CoreThreads = {
      storyteller: await thread('storyteller'),
      config: await thread('config'),
      kibitz: await thread('kibitz'),
    };

    await updateGame(game.id, { channel: BigInt(channel.id) });

    const rows = {
      storyteller: await insertManagedThread({
        game: game.id,
        kind: 'storyteller',
        tag: 'private',
        thread: BigInt(threads.storyteller.id),
      }),
      config: await insertManagedThread({ game: game.id, kind: 'config', thread: BigInt(threads.config.id) }),
      kibitz: await insertManagedThread({ game: game.id, kind: 'kibitz', thread: BigInt(threads.kibitz.id) }),
    };

    // Rows as well as Discord membership, so removal and substitution can read who is where.
    for (const st of members.storytellers) await joinThreads(client, st, Object.values(rows));
    for (const kibitzer of members.kibitzers) await joinThreads(client, kibitzer, [rows.kibitz]);

    return { channel, threads };
  } catch (error) {
    logger.error({
      message: `Provisioning game ${game.id} failed after creating channel ${channel.id}; it is left for somebody to tidy.`,
      error,
    });
    throw error;
  }
};
