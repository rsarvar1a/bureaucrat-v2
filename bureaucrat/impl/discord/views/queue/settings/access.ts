import { rolePickerRow, roleList } from '../../../../../engine/discord/components/role-picker';
import { text, separator } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { Queue } from '../../../../../schema/core/queues.sql';

type QueueRow = typeof Queue.$inferSelect;

/**
 * Who may enter this queue as a Storyteller or sign up for its games as a
 * player: when set, one of these roles is needed on top of the server's own
 * (`/admin config`), never instead of them. And whom its games' `/recruit`
 * pings, which does replace the server's.
 */
export const renderAccess = <S>(view: ViewRow<S>, queue: QueueRow) => {
  const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

  return [
    text(
      '### Roles\n' +
        "Roles this queue asks for **in addition to** the server's Storyteller and Player roles (`/admin config`).\n" +
        `**Storytellers** (to enter the queue or co-Storytell): ${roleList(queue.storytellerRoles, '*no more than the server asks*')}\n` +
        `**Players** (to sign up as a Player or Kibitzer): ${roleList(queue.playerRoles, '*no more than the server asks*')}\n` +
        `**Recruitment pings** (\`/recruit\`, **instead of** the server's): ${roleList(queue.recruitRoles, "*the server's*")}`,
    ),
    separator(),
    rolePickerRow(customId('storyteller-roles'), 'Storytellers also need one of…', queue.storytellerRoles),
    rolePickerRow(customId('player-roles'), 'Players also need one of…', queue.playerRoles),
    rolePickerRow(customId('recruit-roles'), "Recruitment pings (none: the server's)…", queue.recruitRoles),
  ];
};
