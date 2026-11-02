import { SlashCommandSubcommandBuilder } from 'discord.js';
import { Superbuilder } from '../../../../engine/discord/commands/builders/superbuilder';
import { accent } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { getSignupByMember } from '../../../../drizzle/signups';
import { spawnByRoute } from '../../games/create';
import { gameHere } from './here';
import { S } from '../../../../strings';

// Open at the gate: anyone who can see a game's channel may ask to join it.
// The Storytellers decide from the Applications window. The pane asks for
// the role and a note, as the queue entry's Signup does.
export default new Superbuilder(new SlashCommandSubcommandBuilder())
  .describe('Ask to join the game this channel belongs to.')
  .define(async (interaction) => {
    const here = await gameHere(interaction);
    if (!here) return;
    const { game, actor } = here;

    if (game.state === 'completed') {
      await toast.ephemeral(interaction, S.errors.gameAlreadyEnded, { accent: accent.neutral });
      return;
    }

    const participant = await getParticipantByMember(game.id, actor.id);
    if (participant) {
      await toast.ephemeral(interaction, S.errors.alreadyInGame(participant.role), { accent: accent.warning });
      return;
    }

    const pending = await getSignupByMember(game.id, actor.id);

    await spawnByRoute(
      'gsignup',
      { interaction },
      {
        entityId: game.id,
        ids: { gconfig: game.id },
        visibility: 'ephemeral',
        state: { signupId: pending?.id ?? null },
      },
    );
  });
