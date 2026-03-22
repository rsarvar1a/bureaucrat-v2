import type { Client, TextChannel, ThreadChannel } from 'discord.js';

/**
 * Ensures the queue message has an associated thread for entry views.
 * Creates one if it doesn't exist. Idempotent.
 */
export const ensureEntryThread = async (
  client: Client,
  channelId: string,
  messageId: string,
  queueName: string,
): Promise<ThreadChannel> => {
  const channel = (await client.channels.fetch(channelId)) as TextChannel;
  const message = await channel.messages.fetch(messageId);

  if (message.thread) {
    return message.thread;
  }

  return message.startThread({
    name: `${queueName} — Entries`,
    autoArchiveDuration: 10080,
  });
};
