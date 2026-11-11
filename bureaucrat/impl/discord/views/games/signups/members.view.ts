import { ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { confirmButton, type ConfirmState } from '../../../../../engine/discord/components/confirm';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  userSelect,
  userSelectRow,
  v2,
} from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { getGame } from '../../../../../drizzle/games';
import { listParticipants } from '../../../../../drizzle/participants';
import { listSeating } from '../../../../../drizzle/seating';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { addMember, removeMember } from '../../../games/members';
import { displayNames } from '../../queue/members';
import { namer } from '../../naming';
import { GameEvents } from '../events';
import { firstPage, isRole, ROLES, type Role } from './roles';
import { S } from '../../../../../strings';

type MembersState = { role: Role; selected: string | null } & ConfirmState<'remove'>;

const roleOf = (view: { state: MembersState | null }): Role => view.state?.role ?? 'Player';

const remove = confirmButton<MembersState>()({
  action: 'remove',
  label: 'Remove',
  onConfirm: async (ctx, interaction) => {
    const game = await getGame(ctx.view.entityId!);
    const selected = ctx.view.state?.selected;
    const result = game && selected ? await removeMember(interaction.client, game, selected) : null;

    await ctx.updateState({ 'confirming:remove': false, selected: null });
    await ctx.notifyAll(GameEvents.Changed);

    if (result && !result.ok && result.reason === 'last-storyteller') {
      await toast.followUp(interaction, S.errors.lastStoryteller, { accent: accent.warning });
    }
  },
});

export default createView<MembersState>()({
  id: 'gmembers',
  idParams: [],
  events: {},
  defaultState: { role: 'Player', selected: null },
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const role = roleOf(view);
    const [members, seating] = await Promise.all([listParticipants(game.id), listSeating(game.id)]);
    const seatOf = new Map(seating.map((row) => [row.seat.player, row.seat.seat]));
    const [names, name] = await Promise.all([
      displayNames(
        client,
        game.guild,
        members.map((m) => m.member),
      ),
      namer(
        client,
        game.guild,
        view.channel,
        members.map((m) => m.member),
      ),
    ]);
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    const ofRole = members.filter((m) => m.role === role);
    const { rows, note } = firstPage(ofRole);
    const selected = ofRole.find((m) => m.id === view.state?.selected) ?? null;

    const describe = (m: (typeof members)[number]) =>
      m.role === 'Player' && seatOf.has(m.id) ? `seat ${seatOf.get(m.id)}` : m.role === 'Player' ? 'unseated' : m.role;

    const listing = ROLES.map((r) => {
      const group = members.filter((m) => m.role === r);
      const line =
        group.length === 0
          ? '*none*'
          : group
              .map((m) => `${name(m.member)}${m.role === 'Player' && seatOf.has(m.id) ? ` (${seatOf.get(m.id)})` : ''}`)
              .join(', ');
      return `**${r}s:** ${line}`;
    }).join('\n');

    return v2(
      linear(
        text('### Members'),
        text(listing),
        separator(),
        buttonRow(
          ...ROLES.map((r) => button(customId(`role-${r}`), `${r}s`, ButtonStyle.Secondary).setDisabled(r === role)),
          button(view.customId('peek'), 'Peek members', ButtonStyle.Primary),
        ),
        userSelectRow(userSelect(view.customId('add'), `Add a ${role}`)),
        ...(rows.length > 0
          ? [
              selectRow(
                select(view.customId('select'), `Pick a ${role}${note ? ` (${note})` : ''}`).addOptions(
                  rows.map((m) => ({
                    label: names[String(m.member)] ?? String(m.member),
                    description: describe(m),
                    value: m.id,
                    default: m.id === selected?.id,
                  })),
                ),
              ),
              remove.isConfirming(view) && selected
                ? remove.confirmRow(view)
                : remove.row(view).setComponents(remove.button(view).setDisabled(!selected)),
            ]
          : []),
      ),
    );
  },

  interactions: {
    ...remove.interactions,

    add: async (interaction, ctx) => {
      if (!interaction.isUserSelectMenu()) return;
      await interaction.deferUpdate();

      const game = await getGame(ctx.view.entityId!);
      const member = interaction.values[0];
      if (!game || !member) return { action: 'render' };

      const result = await addMember(interaction.client, game, BigInt(member), roleOf(ctx.view));
      if (!result.ok) {
        const name = await namer(interaction.client, game.guild, interaction.channelId, [BigInt(member)]);
        await toast.followUp(interaction, `${name(BigInt(member))} is already in the game as a ${result.role}.`, {
          accent: accent.warning,
        });
        return { action: 'render' };
      }

      await ctx.notify(GameEvents.Changed);
      if (result.threads.failed.length > 0) {
        await toast.followUp(
          interaction,
          `Added, but could not open ${result.threads.failed.length} thread(s) to them.`,
          {
            accent: accent.warning,
          },
        );
      }

      return { action: 'render' };
    },

    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ selected: interaction.values[0] ?? null, 'confirming:remove': false });
      return { action: 'render' };
    },

    // The members as pings, where a ping can reach nobody: an ephemeral pane.
    peek: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView('gpeek', { interaction }, { visibility: 'ephemeral', ids: { gconfig: ctx.view.entityId! } });
    },

    // `role-<Role>` switches the list and what the user select adds.
    '*': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const role = ctx.action.replace(/^role-/, '');
      if (ctx.action.startsWith('role-') && isRole(role)) {
        await ctx.updateState({ role, selected: null, 'confirming:remove': false });
      }

      return { action: 'render' };
    },
  },
});
