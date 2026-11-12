import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { destroyView, deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import { modal, field } from '../../../../../engine/discord/components/modal';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  selectRow,
  select,
  button,
  v2,
} from '../../../../../engine/discord/elements';
import { toast, tryDeleteReply } from '../../../../../engine/discord/reply';
import { getGame } from '../../../../../drizzle/games';
import { getSignup } from '../../../../../drizzle/signups';
import { inGuild } from '../../../guards';
import { getQueue } from '../../../../../drizzle/queues';
import { actorOf, mayJoinAs } from '../../../access';
import type { ViewInteraction } from '../../../../../engine/discord/views/types';
import { declineSignup, requestSignup } from '../../../games/signups';
import { GameEvents } from '../events';
import { isRole, type Role } from './roles';
import { S } from '../../../../../strings';

type SignupState = { signupId: string | null; role?: Role };

const dismiss = dismissButton<SignupState>()({ action: 'dismiss' });

const refusal = (reason: 'ended' | 'already-member' | 'already-pending', role?: Role) =>
  reason === 'ended'
    ? S.errors.gameAlreadyEnded
    : reason === 'already-member'
      ? S.errors.alreadyInGame(role ?? 'member')
      : S.errors.alreadySignedUp;

/** Why the presser may not ask to join this game as `role` (the server's roles, and its queue's), or null. */
const roleRefusal = async (interaction: ViewInteraction, gameId: string, role: Role): Promise<string | null> => {
  const actor = actorOf(interaction);
  if (actor === null) return S.errors.guildOnly;
  const game = await getGame(gameId);
  if (!game || game.guild !== BigInt(interaction.guildId!)) return S.errors.notHere;
  const queue = game.queue ? await getQueue(game.queue) : null;
  const verdict = await mayJoinAs(game.guild, actor, queue, role);
  return verdict.ok ? null : verdict.reason;
};

const note = modal<SignupState>()({
  action: 'message',
  title: 'Sign Up',
  fields: { message: field.paragraph('Message (optional)', { required: false, maxLength: 500 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const game = await getGame(ctx.view.entityId!);
    const role = ctx.view.state?.role;
    if (!game || !role) return;

    // Checked again here: the roles may have changed while the modal was open.
    const refused = await roleRefusal(interaction, game.id, role);
    if (refused) {
      await toast.followUp(interaction, refused, { accent: accent.warning });
      return;
    }

    const result = await requestSignup(game, BigInt(interaction.user.id), role, values['message'] || null);
    if (!result.ok) {
      await toast.followUp(interaction, refusal(result.reason, 'role' in result ? result.role : undefined), {
        accent: accent.warning,
      });
    } else {
      await ctx.notify(GameEvents.Changed);
      await toast.followUp(interaction, `You have asked to join **${game.name}** as a ${role}.`, {
        accent: accent.success,
        timeoutMs: 10_000,
      });
    }

    await destroyView(ctx.view.id);
    await tryDeleteReply(interaction);
  },
});

// What `/signups signup` opens: a role to ask for, then a note; or, for someone
// already waiting, the way to withdraw.
export default createView<SignupState>()({
  id: 'gsignup',
  idParams: [],
  events: {},
  defaultState: { signupId: null },
  subscribesTo: { detach: [GameEvents.Ended] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const pending = view.state?.signupId ? await getSignup(view.state.signupId) : null;

    if (pending) {
      return v2(
        linear(
          text('### Your application'),
          text(`You have asked to join as a **${pending.role}**${pending.message ? `: “${pending.message}”` : '.'}`),
          text('The Storytellers will decide. You can withdraw it below.'),
          separator(),
          buttonRow(button(view.customId('withdraw'), 'Withdraw', ButtonStyle.Danger)),
          dismiss.row(view),
        ),
      );
    }

    return v2(
      linear(
        text('### Sign Up'),
        text('Pick what you would like to be in this game.'),
        separator(),
        selectRow(
          select(view.customId('role'), 'Select a role').addOptions(
            { label: 'Player', value: 'Player', description: 'Play in the game' },
            { label: 'Storyteller', value: 'Storyteller', description: 'Co-Storytell the game' },
            { label: 'Kibitzer', value: 'Kibitzer', description: 'Spectate the game' },
          ),
        ),
        dismiss.row(view),
      ),
    );
  },

  interactions: {
    ...dismiss.interactions,
    ...note.interactions,

    role: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;

      const role = interaction.values[0] ?? '';
      if (!isRole(role)) return;

      const refused = await roleRefusal(interaction, ctx.view.entityId!, role);
      if (refused) {
        await toast.ephemeral(interaction, refused, { accent: accent.warning });
        return;
      }

      await ctx.updateState({ role });
      await note.show(interaction, ctx, { title: `Sign up as ${role}` });
    },

    withdraw: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const signupId = ctx.view.state?.signupId;
      if (signupId) {
        await declineSignup(signupId);
        await ctx.notify(GameEvents.Changed);
      }

      await destroyView(ctx.view.id);
      await tryDeleteReply(interaction);
    },
  },
});
