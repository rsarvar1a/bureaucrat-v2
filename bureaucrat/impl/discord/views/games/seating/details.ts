import type { Client } from 'discord.js';
import { linear, text, separator, v2 } from '../../../../../engine/discord/elements';
import type { MessagePayload } from '../../../../../engine/discord/views/types';
import { getOrCreateGameSettings } from '../../../../../drizzle/game-settings';
import { getParticipantByMember } from '../../../../../drizzle/participants';
import { listSeating } from '../../../../../drizzle/seating';
import { ownSeat, publishedSquare } from '../../../games/published';
import type { Game } from '../../../../../schema/core/games.sql';
import { namer } from '../../naming';
import { roleLook, roleTag, townSquare } from './render';
import { characterChoices } from './roles';
import { getScriptSummary } from '../../../../../drizzle/scripts';
import { S } from '../../../../../strings';
import { publishedLine } from './published-line';

type GameRow = typeof Game.$inferSelect;

/**
 * What a player may know: the square as last published, with states and
 * travelers' roles, and, when the Storytellers expose roles, the role they
 * themselves were given (the apparent one when it differs), live or as
 * published per the roles-live setting. A Storyteller or Kibitzer gets the
 * whole chart as it stands, every role written. Served by the square's
 * Details button and by `/game seating`.
 */
export const seatingDetails = async (
  client: Client,
  game: GameRow,
  channelId: bigint | string | null | undefined,
  member: bigint,
): Promise<MessagePayload> => {
  const [live, settings, participant, script] = await Promise.all([
    listSeating(game.id),
    getOrCreateGameSettings(game.id),
    getParticipantByMember(game.id, member),
    getScriptSummary(game.id),
  ]);
  const look = roleLook(client, game.guild, characterChoices(script?.json));

  if (participant && participant.role !== 'Player') {
    const name = await namer(
      client,
      game.guild,
      channelId,
      live.map((r) => r.member),
    );
    return {
      ...v2(
        linear(
          text(`### ${game.name}`),
          text(townSquare(live, look, name)),
          text('-# The chart as it stands, roles and all; the players see the last publish.'),
        ),
      ),
      allowedMentions: { parse: [] },
    };
  }

  const rows = publishedSquare(settings.publishedSeating, live, settings.rolesLive);
  const name = await namer(
    client,
    game.guild,
    channelId,
    (rows ?? []).map((r) => r.member),
  );

  const own: string[] = [];
  if (settings.exposeRoles) {
    const seat = participant ? ownSeat(settings.publishedSeating, live, participant.id, settings.rolesLive) : null;
    const role = seat ? (seat.apparentRole ?? seat.trueRole) : null;
    const alignment = seat ? (seat.apparentRole ? seat.apparentAlignment : seat.trueAlignment) : null;
    own.push(
      !seat
        ? 'You are not seated in this game.'
        : role
          ? `You are the ${roleTag(role, look, alignment)} ${role}.`
          : 'You have no role yet.',
    );
  }

  return {
    ...v2(
      linear(
        text(`### ${game.name}`),
        text(rows ? townSquare(rows, look, name, (row) => row.seat.traveler) : S.errors.seatingUnpublished),
        text(publishedLine(settings.publishedAt)),
        ...(own.length > 0 ? [separator(), text(own.join('\n'))] : []),
      ),
    ),
    allowedMentions: { parse: [] },
  };
};
