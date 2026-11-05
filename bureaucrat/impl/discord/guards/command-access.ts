import { Permissions, type Permission } from '../../acl/permissions';

/**
 * Which permission a slash command sits behind.
 *
 * Import-free beyond the permission catalogue for the same reason as
 * `scope.ts`: the mapping is the part worth testing, and it can only be tested
 * exhaustively while nothing here can reach a socket.
 *
 * The decision is made centrally, in `onChatInputCommand`, rather than at the
 * top of each handler:
 *
 * - a new admin command is gated by living under `admin`, not by somebody
 *   remembering to gate it;
 * - `admin::sync` had no check at all, so anyone could re-publish the command
 *   forest into any guild id they liked;
 * - the check runs before the handler, so no handler has to think about
 *   whether it has deferred yet.
 *
 * The cost is real and worth naming: a reader of `commands/admin/sync.cmd.ts`
 * no longer sees who may run it. The test beside this file is what keeps that
 * honest.
 */
export type CommandAccess = Permission | 'open';

/**
 * Commands whose permission does not follow from where they live.
 *
 * Creating a queue posts a public panel into a channel, which is an act of
 * server furniture rather than of play.
 */
const RULES: Record<string, CommandAccess> = {
  'queues::new': Permissions.Queue.Create,
  // Creating a game by hand bypasses the queue, which is the sanctioned path;
  // ending one is open here and gated in the handler by who storytells it,
  // a question the path alone cannot answer.
  'game::new': Permissions.Game.Create,
  // The server's default archive is server furniture, like a queue's panel.
  'archives::manage': Permissions.Server.Manage,
  'archives::reflow': Permissions.Server.Manage,
  'archives::offsite::manage': Permissions.Server.Manage,
  'archives::offsite::copy': Permissions.Server.Manage,
  'archives::offsite::reflow': Permissions.Server.Manage,
  'archives::offsite::sync': Permissions.Server.Manage,
};

/**
 * Everything under `admin` needs `server.manage` and everything under
 * `settings` needs `server.permissions`, by virtue of living there. Everything
 * else is open unless listed.
 *
 * `open` rather than some baseline permission as the default: the ACL is
 * closed by default (no grant means deny), so an unmapped default of "any
 * permission" would lock everyone out of `/queues list`.
 */
export const commandAccess = (path: string): CommandAccess =>
  path === 'admin' || path.startsWith('admin::')
    ? Permissions.Server.Manage
    : path === 'settings' || path.startsWith('settings::')
      ? Permissions.Server.Permissions
      : (RULES[path] ?? 'open');
