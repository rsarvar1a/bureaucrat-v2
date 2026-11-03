import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import {
  bump,
  shown,
  stepperRow,
  stored,
  type Nudge,
  type Stepper,
} from '../../../../../engine/discord/components/stepper';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  select,
  selectRow,
  v2,
} from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import type { HandlerResult, ViewContext, ViewInteraction } from '../../../../../engine/discord/views/types';
import { getGame } from '../../../../../drizzle/games';
import { getOrCreateGameSettings, updateGameSettings } from '../../../../../drizzle/game-settings';
import { listSignups } from '../../../../../drizzle/signups';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { acceptSignup, declineSignup } from '../../../games/signups';
import { displayNames } from '../../queue/members';
import { namer } from '../../naming';
import { GameEvents } from '../events';
import { firstPage, ROLES, type Role } from './roles';

/** The applications ticked for a batch decision, and the roles the dropdown is narrowed to (none means all). */
type ApplicationsState = { selected: string[]; roles: Role[] };

const byRoles = <T extends { role: Role }>(rows: T[], roles: Role[]) =>
  roles.length > 0 ? rows.filter((s) => roles.includes(s.role)) : rows;

const sentence = (parts: string[]) => parts.join(' ');

export const PLAYER_COUNT: Stepper = {
  slug: 'pc',
  label: 'Intended number of seats',
  min: 5,
  max: 20,
  bigStep: 5,
  unlimited: true,
  unlimitedLabel: 'not set',
};

type Outcome = { kind: 'success' | 'warning'; message: string };

/** Every ticked application in turn; one toast for the batch, warning-coloured if any part was. */
const decide = async (
  interaction: ViewInteraction,
  ctx: ViewContext<ApplicationsState>,
  act: (signupId: string) => Promise<Outcome | null>,
): Promise<HandlerResult> => {
  if (!interaction.isMessageComponent()) return;
  await interaction.deferUpdate();

  const outcomes: Outcome[] = [];
  for (const id of ctx.view.state?.selected ?? []) {
    const outcome = await act(id);
    if (outcome) outcomes.push(outcome);
  }

  await ctx.updateState({ selected: [] });
  await ctx.notify(GameEvents.Changed);

  if (outcomes.length > 0) {
    const kind = outcomes.some((o) => o.kind === 'warning') ? 'warning' : 'success';
    await toast.followUp(interaction, sentence(outcomes.map((o) => o.message)), { accent: accent[kind] });
  }

  return { action: 'render' };
};

export default createView<ApplicationsState>()({
  id: 'gapplications',
  idParams: [],
  events: {},
  defaultState: { selected: [], roles: [] },
  subscribesTo: { render: [GameEvents.Changed], destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const [pending, settings] = await Promise.all([listSignups(game.id), getOrCreateGameSettings(game.id)]);
    const [names, name] = await Promise.all([
      displayNames(
        client,
        game.guild,
        pending.map((s) => s.member),
      ),
      namer(
        client,
        game.guild,
        view.channel,
        pending.map((s) => s.member),
      ),
    ]);
    const roles = view.state?.roles ?? [];
    const shownRows = byRoles(pending, roles);
    const { rows, note } = firstPage(shownRows);
    const selected = new Set((view.state?.selected ?? []).filter((id) => rows.some((s) => s.id === id)));
    const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

    const hidden = pending.length - shownRows.length;
    const listing =
      pending.length === 0
        ? 'Members can apply with `/signups signup` in the game channel.'
        : shownRows.map((s) => `${name(s.member)} · ${s.role}${s.message ? ` · ${s.message}` : ''}`).join('\n') +
          (note ? `\n*${note}*` : '') +
          (hidden > 0 ? `\n-# ${hidden} other${hidden === 1 ? '' : 's'} hidden by the role filter.` : '');

    return v2(
      linear(
        text('### Applications'),
        text(listing),
        separator(),
        ...(pending.length > 0
          ? [
              selectRow(
                select(customId('filter'), 'Filter by role')
                  .setMinValues(0)
                  .setMaxValues(ROLES.length)
                  .addOptions(ROLES.map((r) => ({ label: `${r}s`, value: r, default: roles.includes(r) }))),
              ),
            ]
          : []),
        ...(rows.length > 0
          ? [
              selectRow(
                select(customId('select'), 'Pick applications')
                  .setMinValues(0)
                  .setMaxValues(rows.length)
                  .addOptions(
                    rows.map((s) => ({
                      label: `${names[String(s.member)] ?? s.member} · ${s.role}`,
                      description: s.message?.slice(0, 100) || undefined,
                      value: s.id,
                      default: selected.has(s.id),
                    })),
                  ),
              ),
              buttonRow(
                button(
                  customId('accept'),
                  selected.size > 1 ? `Accept ${selected.size}` : 'Accept',
                  ButtonStyle.Success,
                ).setDisabled(selected.size === 0),
                button(
                  customId('decline'),
                  selected.size > 1 ? `Decline ${selected.size}` : 'Decline',
                  ButtonStyle.Danger,
                ).setDisabled(selected.size === 0),
              ),
            ]
          : []),
        stepperRow(customId, PLAYER_COUNT, shown(PLAYER_COUNT, settings.playerCount)),
      ),
    );
  },

  interactions: {
    select: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      await ctx.updateState({ selected: interaction.values });
      return { action: 'render' };
    },

    // Narrowing the dropdown drops any tick that is no longer shown.
    filter: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const roles = interaction.values.filter((v): v is Role => (ROLES as readonly string[]).includes(v));
      const pending = byRoles(await listSignups(ctx.view.entityId!), roles);
      const selected = (ctx.view.state?.selected ?? []).filter((id) => pending.some((s) => s.id === id));
      await ctx.updateState({ roles, selected });

      return { action: 'render' };
    },

    accept: async (interaction, ctx) =>
      decide(interaction, ctx, async (id) => {
        const game = await getGame(ctx.view.entityId!);
        if (!game) return null;

        const result = await acceptSignup(interaction.client, game, id);
        if (!result.ok) {
          return result.reason === 'already-member'
            ? { kind: 'warning', message: 'They are already in the game!' }
            : null;
        }

        const { failed } = result.threads;
        const name = await namer(interaction.client, game.guild, interaction.channelId, [result.participant.member]);
        return {
          kind: failed.length > 0 ? 'warning' : 'success',
          message:
            `${name(result.participant.member)} joins as a ${result.participant.role}.` +
            (failed.length > 0 ? ` Could not add them to ${failed.length} thread(s).` : ''),
        };
      }),

    decline: async (interaction, ctx) =>
      decide(interaction, ctx, async (id) => {
        await declineSignup(id);
        return null;
      }),

    // The player-count stepper: `bump:pc:<nudge>`.
    '*': async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const [verb, slug, nudge] = ctx.action.split(':');
      if (verb !== 'bump' || slug !== PLAYER_COUNT.slug || !nudge) return { action: 'render' };

      const settings = await getOrCreateGameSettings(ctx.view.entityId!);
      const value = bump(PLAYER_COUNT, shown(PLAYER_COUNT, settings.playerCount), nudge as Nudge);
      await updateGameSettings(ctx.view.entityId!, { playerCount: stored(PLAYER_COUNT, value) });
      await ctx.notify(GameEvents.Changed);

      return { action: 'render' };
    },
  },
});
