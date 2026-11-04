import { ChannelType } from 'discord.js';
import { text, separator, channelSelect, channelSelectRow } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { Queue } from '../../../../../schema/core/queues.sql';

type QueueRow = typeof Queue.$inferSelect;

const where = (category: bigint | null) =>
  category === null ? 'at the top of the server, outside any category' : `in <#${category}>`;

const filed = (archive: bigint | null) =>
  archive === null ? "in the server's default archive (`/archives manage`)" : `in <#${archive}>`;

// Two category pickers in one tab: where the queue's games begin, and where
// they are filed once ended and archived.
export const renderCategory = <S>(view: ViewRow<S>, queue: QueueRow) => {
  const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

  const picker = (action: string, placeholder: string, current: bigint | null) => {
    const menu = channelSelect(customId(action), placeholder)
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(0)
      .setMaxValues(1);
    if (current !== null) menu.setDefaultChannels(String(current));
    return channelSelectRow(menu);
  };

  return [
    text('### Category'),
    text(
      `Games claimed from this queue are created ${where(queue.category)}.\n` +
        `Once ended, \`/game archive\` files them ${filed(queue.archive)}. ` +
        'A full category rolls over to the next number and this setting follows it.',
    ),
    separator(),
    picker('category', 'Games are created in…', queue.category),
    picker('archive', 'Ended games are archived to…', queue.archive),
  ];
};
