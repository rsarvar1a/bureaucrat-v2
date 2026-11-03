import type { Client } from 'discord.js';
import { linear, separator, text, v2 } from '../../../../engine/discord/elements';
import type { MessagePayload } from '../../../../engine/discord/views/types';
import { getSeatedPlayer } from '../../../../drizzle/seating';
import { listVotes } from '../../../../drizzle/votes';
import type { Nomination } from '../../../../schema/core/nominations.sql';
import type { Game } from '../../../../schema/core/games.sql';
import { consoleBallot, headline, statusLine } from '../../games/nominations/format';
import { statusOf, tally } from '../../games/nominations/rules';
import { roleLook, stateTag, who } from '../games/seating/render';
import { namer } from '../naming';

type GameRow = typeof Game.$inferSelect;
type NominationRow = typeof Nomination.$inferSelect;

/** The ballot as the console shows it, every hand's private vote beneath, with nothing to press: a Kibitzer's view. */
export const ballotPeek = async (
  client: Client,
  game: GameRow,
  nomination: NominationRow,
  channelId: bigint | string | null | undefined,
): Promise<MessagePayload> => {
  const [ballot, accuser, nominee] = await Promise.all([
    listVotes(nomination.id),
    getSeatedPlayer(nomination.plaintiff),
    nomination.defendant ? getSeatedPlayer(nomination.defendant) : null,
  ]);
  const name = await namer(client, game.guild, channelId, [
    accuser?.member,
    nominee?.member,
    ...ballot.map((v) => v.member),
  ]);
  const look = roleLook(client, game.guild, null);
  const votes = ballot.map((v) => v.vote);
  const status = statusOf(votes, nomination.required, nomination.finalizedAt !== null);

  const hands = consoleBallot(
    ballot.map((v) => ({
      position: v.vote.position,
      locked: v.vote.locked,
      yes: v.vote.yes,
      weight: v.vote.weight,
      public: v.vote.public,
      private: v.vote.private,
      name: who(v, name),
      state: stateTag(v.vote.state, look.emote),
    })),
    nomination.required,
  ).join('\n');

  return {
    ...v2(
      linear(
        text(
          `### ${headline(nomination.kind, accuser ? who(accuser, name) : '*an empty seat*', nominee ? who(nominee, name) : null)}`,
        ),
        text(statusLine(status, tally(votes), nomination.required, nomination.block)),
        separator(),
        text(hands || '*Nobody is seated to vote.*'),
      ),
    ),
    allowedMentions: { parse: [] },
  };
};
