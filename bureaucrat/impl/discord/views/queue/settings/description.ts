import { ButtonStyle } from 'discord.js';
import { text, separator, buttonRow, button } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { Queue } from '../../../../../schema/core/queues.sql';

type QueueRow = typeof Queue.$inferSelect;

export const previewsLabel = (on: boolean) => `Entry previews · ${on ? 'on' : 'off'}`;

export const renderDescription = <S>(view: ViewRow<S>, queue: QueueRow) => [
  text(`### Manage Queue: ${queue.name}`),
  text(queue.description || '*No description*'),
  separator(),
  buttonRow(
    button(view.customId('edit' as Parameters<typeof view.customId>[0]), 'Edit', ButtonStyle.Primary),
    button(
      view.customId('previews' as Parameters<typeof view.customId>[0]),
      previewsLabel(queue.entryPreviews),
      queue.entryPreviews ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
  ),
];
