import { ChannelType, type Client } from 'discord.js';

/** How a member is written in a message: see `namer`. Nothing for nobody (an empty seat). */
export type Name = (member: bigint | null | undefined) => string;

/**
 * Whether an @mention is safe where a message lands. Discord adds a mentioned
 * user to a private thread, so a mention in GAME CONFIG or an ST thread would
 * pull a player into it; those get names. A public thread or channel may ping.
 * An unknown channel is treated as private.
 */
export const mayMention = async (client: Client, channelId: bigint | string | null | undefined): Promise<boolean> => {
  if (!channelId || BigInt(channelId) === 0n) return false;
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  return channel !== null && channel.type !== ChannelType.PrivateThread;
};

/**
 * `<@id>` where a ping is harmless; otherwise the member's display name in
 * bold, with their username after it when the two differ, so a private thread
 * names people without adding them.
 */
export const namer = async (
  client: Client,
  guildId: bigint,
  channelId: bigint | string | null | undefined,
  members: Iterable<bigint | null | undefined>,
): Promise<Name> => {
  if (await mayMention(client, channelId)) return (member) => (member == null ? '' : `<@${member}>`);

  const names: Record<string, string> = {};
  const guild = await client.guilds.fetch(String(guildId)).catch(() => null);
  if (guild) {
    const ids = [...new Set([...members].filter((m): m is bigint => m != null).map(String))];
    const fetched = await Promise.allSettled(ids.map((id) => guild.members.fetch(id)));
    for (const result of fetched) {
      if (result.status !== 'fulfilled') continue;
      const { displayName, user } = result.value;
      names[result.value.id] =
        displayName === user.username ? `**${displayName}**` : `**${displayName}** (${user.username})`;
    }
  }

  return (member) => (member == null ? '' : (names[String(member)] ?? `**${member}**`));
};
