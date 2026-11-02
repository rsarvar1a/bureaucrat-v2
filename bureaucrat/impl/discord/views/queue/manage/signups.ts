import { text, separator, linear, selectRow, select } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { QueueEntrySignup } from '../../../../../schema/core/queues.sql';

export type Role = 'Player' | 'Storyteller' | 'Kibitzer';

export const ROLES: Role[] = ['Player', 'Storyteller', 'Kibitzer'];

type Signup = typeof QueueEntrySignup.$inferSelect;

export type SignupsState = {
  selectedSignupId: string | null;
  roleFilter: Role[];
};

export const signupStatusLine = (member: bigint, role: string, accepted: boolean | null) => {
  const mention = `<@${member}>`;
  if (accepted === true) return `✅ You accepted ${mention}'s signup for the ${role} role.`;
  if (accepted === false) return `❌ You declined ${mention}'s signup for the ${role} role.`;
  return `${mention} is requesting the ${role} role.`;
};

export const signupStatusLabel = (accepted: boolean | null) =>
  accepted === true ? 'Accepted' : accepted === false ? 'Declined' : 'Pending';

export const filtered = (signups: Signup[], roleFilter: Role[]) =>
  roleFilter.length > 0 ? signups.filter((s) => roleFilter.includes(s.role as Role)) : signups;

export const renderSignups = (
  view: ViewRow<SignupsState>,
  title: string,
  signups: Signup[],
  names: Record<string, string>,
): { body: Parameters<typeof linear>; controls: Parameters<typeof linear>; selected: Signup | null } => {
  const heading = [text(`### Manage Signups: ${title}`), separator()];

  if (signups.length === 0) {
    return { body: [...heading, text('*No signups yet.*'), separator()], controls: [], selected: null };
  }

  const state = view.state;

  const filterMenu = selectRow(
    select(view.customId('filter'), 'Filter by role')
      .setMinValues(0)
      .setMaxValues(ROLES.length)
      .addOptions(ROLES.map((r) => ({ label: r, value: r, default: state.roleFilter.includes(r) }))),
  );

  const shown = filtered(signups, state.roleFilter);

  const signupMenu =
    shown.length > 0
      ? selectRow(
          select(view.customId('select'), 'Select a signup to manage').addOptions(
            shown.slice(0, 25).map((s) => ({
              label: `${names[String(s.member)] ?? String(s.member)} — ${s.role}`,
              description: signupStatusLabel(s.accepted),
              value: s.id,
              default: s.id === state.selectedSignupId,
            })),
          ),
        )
      : text('*No signups match the selected roles.*');

  const selected = state.selectedSignupId ? (shown.find((s) => s.id === state.selectedSignupId) ?? null) : null;

  const detail = selected
    ? [
        text(signupStatusLine(selected.member, selected.role, selected.accepted)),
        ...(selected.message ? [text(`> ${selected.message}`)] : []),
        separator(),
      ]
    : [];

  return { body: [...heading, ...detail], controls: [filterMenu, signupMenu], selected };
};
