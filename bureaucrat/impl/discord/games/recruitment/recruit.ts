import { PermissionFlagsBits, time, TimestampStyles, type Client } from 'discord.js';
import { claimRecruitment, getGame, updateGame } from '../../../../drizzle/games';
import { getOrCreateGuildSettings } from '../../../../drizzle/guild-settings';
import { getQueue } from '../../../../drizzle/queues';
import type { Game } from '../../../../schema/core/games.sql';
import { roleList } from '../../../../engine/discord/components/role-picker';
import { fault } from '../../errors/record';
import { S } from '../../../../strings';
import { nextRecruitment, recruitCutoff, recruitmentFor, type Recruitment } from './policy';

type GameRow = typeof Game.$inferSelect;

export type RecruitResult =
  | { ok: true; next: Date }
  | { ok: false; reason: 'started' | 'unset' | 'failed' }
  | { ok: false; reason: 'cooldown'; retryAt: Date }
  | { ok: false; reason: 'unmentionable'; roles: bigint[] };

/** The server's recruitment, or the game's queue's where it sets its own. */
export const recruitmentOf = async (game: GameRow): Promise<Recruitment> => {
  const server = await getOrCreateGuildSettings(game.guild);
  const queue = game.queue ? ((await getQueue(game.queue)) ?? null) : null;
  return recruitmentFor(server, queue);
};

/**
 * Pings the recruitment roles in a game's channel on its Storyteller's behalf,
 * at most once per cooldown and only while it takes signups: the roles are
 * ones the server would not let its members ping themselves. The slot is
 * claimed in the database before the post, and given back if the post fails.
 * Nothing but those roles rings, whatever the note says.
 */
export const recruit = async (
  client: Client,
  game: GameRow,
  by: bigint,
  note: string | null,
): Promise<RecruitResult> => {
  if (game.state !== 'signups') return { ok: false, reason: 'started' };

  const { roles: configured, cooldownHours } = await recruitmentOf(game);
  if (configured.length === 0) return { ok: false, reason: 'unset' };

  const now = new Date();
  const due = nextRecruitment(game.recruitedAt, cooldownHours);
  if (due && due > now) return { ok: false, reason: 'cooldown', retryAt: due };

  const channel = await client.channels.fetch(String(game.channel)).catch(() => null);
  if (!channel || !channel.isSendable() || channel.isDMBased()) return { ok: false, reason: 'failed' };

  // A deleted role is skipped; one the bot may not ping is refused before the slot is spent.
  const guild = channel.guild;
  const roles = (await Promise.all(configured.map((id) => guild.roles.fetch(String(id)).catch(() => null)))).filter(
    (role) => role !== null,
  );
  if (roles.length === 0) return { ok: false, reason: 'unset' };
  const me = await guild.members.fetchMe();
  if (!channel.permissionsFor(me).has(PermissionFlagsBits.MentionEveryone)) {
    const unmentionable = roles.filter((role) => !role.mentionable).map((role) => BigInt(role.id));
    if (unmentionable.length > 0) return { ok: false, reason: 'unmentionable', roles: unmentionable };
  }

  const claimed = await claimRecruitment(game.id, now, recruitCutoff(now, cooldownHours));
  if (!claimed) {
    const fresh = await getGame(game.id);
    if (!fresh || fresh.state !== 'signups') return { ok: false, reason: 'started' };
    return { ok: false, reason: 'cooldown', retryAt: nextRecruitment(fresh.recruitedAt, cooldownHours) ?? now };
  }

  const ids = roles.map((role) => role.id);
  try {
    await channel.send({
      content: S.games.recruitment(roleList(ids.map(BigInt), ''), game.name, note, `<@${by}>`),
      allowedMentions: { roles: ids },
    });
  } catch (error) {
    await updateGame(game.id, { recruitedAt: game.recruitedAt });
    fault('game.recruit', 'failed', error, { game: game.id, channel: game.channel });
    return { ok: false, reason: 'failed' };
  }

  return { ok: true, next: nextRecruitment(now, cooldownHours)! };
};

const relative = (at: Date) => time(at, TimestampStyles.RelativeTime);

/** What the Storyteller is told, either way. */
export const recruitReply = (result: RecruitResult, channel: bigint): { ok: boolean; message: string } => {
  if (result.ok) return { ok: true, message: S.games.recruited(`<#${channel}>`, relative(result.next)) };
  switch (result.reason) {
    case 'started':
      return { ok: false, message: S.errors.recruitStarted };
    case 'unset':
      return { ok: false, message: S.errors.recruitUnset };
    case 'cooldown':
      return { ok: false, message: S.errors.recruitCooldown(relative(result.retryAt)) };
    case 'unmentionable':
      return { ok: false, message: S.errors.recruitUnmentionable(roleList(result.roles, '')) };
    case 'failed':
      return { ok: false, message: S.errors.recruitFailed };
  }
};
