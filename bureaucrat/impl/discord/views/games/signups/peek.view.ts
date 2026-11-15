import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { accent, text, separator, linear, v2 } from '../../../../../engine/discord/elements';
import { getGame } from '../../../../../drizzle/games';
import { listParticipants } from '../../../../../drizzle/participants';
import { listSeating } from '../../../../../drizzle/seating';
import { listSignups } from '../../../../../drizzle/signups';
import { inGuild } from '../../../guards';
import { GameEvents } from '../events';
import { ROLES } from './roles';
import { S } from '../../../../../strings';

type Empty = Record<string, never>;

const dismiss = dismissButton<Empty>()({ action: 'dismiss' });

/**
 * The members as mentions, ephemeral beside the Members window, with the
 * signups still waiting under each role. The window
 * itself writes names, because a mention in a private thread would pull the
 * person in; an ephemeral message pulls nobody anywhere, so here they can be
 * copied as pings.
 */
export default createView<Empty>()({
  id: 'gpeek',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text(S.errors.notHere), separator(), dismiss.row(view)).setAccentColor(accent.neutral));

    const [members, seating, pending] = await Promise.all([
      listParticipants(game.id),
      listSeating(game.id),
      listSignups(game.id),
    ]);
    const seatOf = new Map(seating.map((row) => [row.seat.player, row.seat.seat]));
    // Players in seat order, the unseated after; the other roles as they joined.
    const byRole = ROLES.map((role) => ({
      role,
      members: members
        .filter((m) => m.role === role)
        .sort((a, b) => (seatOf.get(a.id) ?? Infinity) - (seatOf.get(b.id) ?? Infinity)),
      pending: pending.filter((s) => s.role === role).map((s) => `<@${s.member}>`),
    })).filter(({ members, pending }) => members.length > 0 || pending.length > 0);

    const sections = byRole.map(({ role, members, pending }) =>
      [
        `**${role}s**`,
        ...members.map((m, i) => `${i + 1}. <@${m.member}>`),
        ...(pending.length > 0 ? [S.games.pendingLine(pending)] : []),
      ].join('\n'),
    );

    return {
      ...v2(
        linear(
          text(`### Members of ${game.name}`),
          text(sections.length > 0 ? sections.join('\n\n') : S.games.nobodyInGame),
          separator(),
          dismiss.row(view),
        ).setAccentColor(accent.brand),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    ...dismiss.interactions,
  },
});
