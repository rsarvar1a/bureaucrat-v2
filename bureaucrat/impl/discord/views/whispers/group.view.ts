import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { accent, text, linear, userSelectRow, userSelect, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import { getGame } from '../../../../drizzle/games';
import { getParticipantByMember } from '../../../../drizzle/participants';
import { actorOf } from '../../access';
import { inGuild } from '../../guards';
import { proposeWhisper } from '../../games/whispers/post';
import { S } from '../../../../strings';

type GroupPickState = { async: boolean };

/** Discord caps a user select at 25; a whisper this wide is a town meeting. */
const MAX_INVITEES = 10;

/**
 * The picker behind `/whispers group`: a slash command cannot take several
 * users at once, so the command answers with this ephemeral and the select
 * does the asking. One pick posts the invitation and the picker goes away.
 */
export default createView<GroupPickState>()({
  id: 'gwhispergroup',
  idParams: [],
  events: {},
  defaultState: { async: false },
  subscribesTo: { render: [], destroy: [] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) =>
    v2(
      linear(
        text(`Who do you want to whisper with?${view.state?.async ? ' *(async)*' : ''}`),
        userSelectRow(userSelect(view.customId('pick'), 'Pick the players').setMinValues(1).setMaxValues(MAX_INVITEES)),
      ),
    ),

  interactions: {
    pick: async (interaction, ctx) => {
      if (!interaction.isUserSelectMenu()) return;
      await interaction.deferUpdate();

      const actor = actorOf(interaction);
      const game = await getGame(ctx.view.entityId!);
      const me = actor && game ? await getParticipantByMember(game.id, actor.id) : undefined;
      if (!game || !me) {
        await toast.followUp(interaction, S.errors.notInGame, { accent: accent.warning });
        return { action: 'destroy' };
      }

      const invitees = await Promise.all(interaction.values.map((id) => getParticipantByMember(game.id, BigInt(id))));
      if (invitees.some((p) => !p)) {
        await toast.followUp(interaction, S.errors.whisperRefused['invitee-not-player'], { accent: accent.warning });
        return { action: 'render' };
      }

      const posted = await proposeWhisper(
        interaction.client,
        { interaction },
        {
          game,
          initiator: me,
          invitees: invitees.map((p) => p!),
          async: ctx.view.state?.async ?? false,
          free: false,
        },
      );
      await toast.followUp(
        interaction,
        posted.ok && posted.kind === 'invited'
          ? S.whispers.invited(posted.channel)
          : posted.ok
            ? S.whispers.opened
            : S.errors.whisperRefused[posted.reason],
        {
          accent: posted.ok ? accent.success : accent.warning,
        },
      );

      return posted.ok ? { action: 'destroy' } : { action: 'render' };
    },
  },
});
