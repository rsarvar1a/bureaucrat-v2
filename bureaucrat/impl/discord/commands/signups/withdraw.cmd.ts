import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getSeatOfParticipant } from '../../../../drizzle/seating';
import { getSignupByMember } from '../../../../drizzle/signups';
import { removeMember } from '../../games/members';
import { publish } from '../../games/nominations/publish';
import { declineSignup } from '../../games/signups';
import { gameEvents } from '../../views/games/events';
import { gameHere } from './here';
import { S } from '../../../../strings';

// The way out before the game has hold of you: a pending application is
// dropped, and a Player or Kibitzer not yet seated leaves the game. Once
// seated, or as a Storyteller, the Members window is the place.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Withdraw your signup, or leave the game if you are not seated yet.')
  .define(async (interaction) => {
    const here = await gameHere(interaction);
    if (!here) return;
    const { game, actor } = here;

    if (game.state === 'completed') {
      await toast.ephemeral(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
      return;
    }

    const pending = await getSignupByMember(game.id, actor.id);
    if (pending) {
      await declineSignup(pending.id);
      await publish(interaction.client, [gameEvents(game.id).Changed]);
      await toast.ephemeral(interaction, S.games.withdrawn(game.name), { accent: accent.success });
      return;
    }

    const participant = await getParticipantByMember(game.id, actor.id);
    if (!participant) {
      await toast.ephemeral(interaction, S.errors.nothingToWithdraw, { accent: accent.neutral });
      return;
    }
    if (participant.role === 'Storyteller') {
      await toast.ephemeral(interaction, S.errors.storytellerCannotWithdraw, { accent: accent.warning });
      return;
    }
    if (await getSeatOfParticipant(participant.id)) {
      await toast.ephemeral(interaction, S.errors.seatedCannotWithdraw, { accent: accent.warning });
      return;
    }

    const removed = await removeMember(interaction.client, game, participant.id);
    if (!removed.ok) {
      await toast.ephemeral(interaction, S.errors.nothingToWithdraw, { accent: accent.neutral });
      return;
    }
    await publish(interaction.client, [gameEvents(game.id).Changed]);
    await toast.ephemeral(interaction, S.games.left(game.name, participant.role), { accent: accent.success });
  });
