import { PermissionFlagsBits } from 'discord.js';

export type MemberOverwrite = { allow: bigint; deny: bigint };

/**
 * What one member's own overwrite on the game channel says, from the two
 * reasons there are to have one. A player in an open synchronous whisper may
 * speak in threads and not in town. A Moderator who plays loses Manage
 * Threads, which would show them every private thread (and every thread
 * inherits it from the channel), and Pin Messages. Null: no overwrite at all.
 */
export const memberOverwrite = (silenced: boolean, recused: boolean): MemberOverwrite | null => {
  if (!silenced && !recused) return null;
  const F = PermissionFlagsBits;
  return {
    allow: silenced ? F.SendMessagesInThreads : 0n,
    deny: (silenced ? F.SendMessages : 0n) | (recused ? F.ManageThreads | F.PinMessages : 0n),
  };
};
