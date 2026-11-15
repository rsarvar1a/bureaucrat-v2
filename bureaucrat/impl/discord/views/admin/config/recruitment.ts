import { PermissionFlagsBits, type Client } from 'discord.js';
import { rolePickerRow, roleList } from '../../../../../engine/discord/components/role-picker';
import { nudges, stepperRow, type Nudge, type Stepper } from '../../../../../engine/discord/components/stepper';
import { text, separator } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { GuildSettings } from '../../../../../schema/core/guilds.sql';
import { COOLDOWN } from '../../../games/recruitment/policy';

type SettingsRow = typeof GuildSettings.$inferSelect;

export const COOLDOWN_STEPPER: Stepper = { slug: 'cool', label: 'Cooldown', ...COOLDOWN };

export type CooldownAction = `bump:cool:${Nudge}`;

export const COOLDOWN_ACTIONS = nudges(COOLDOWN_STEPPER).map((nudge) => `bump:cool:${nudge}` as CooldownAction);

/** Without Mention All Roles the bot rings only roles anyone may mention, which recruitment roles seldom are. */
const mayPingAll = async (client: Client, guild: bigint): Promise<boolean> => {
  const server = await client.guilds.fetch(String(guild)).catch(() => null);
  const me = server ? await server.members.fetchMe().catch(() => null) : null;
  return me?.permissions.has(PermissionFlagsBits.MentionEveryone) ?? true;
};

export const renderRecruitment = async <S>(view: ViewRow<S>, settings: SettingsRow, client: Client) => {
  const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);
  const warning = (await mayPingAll(client, settings.guild))
    ? []
    : ['-# ⚠️ The bot lacks **Mention @everyone, @here and All Roles**, so only roles set as mentionable will ring.'];

  return [
    text(
      [
        '### Recruitment',
        "A game's Storytellers may ping these roles in its channel while it takes signups, with `/recruit` or Messaging → Recruit, once per cooldown. A queue may set its own roles or cooldown instead (its Roles and Resources tabs).",
        `**Pings** · ${roleList(settings.recruitRoles, '*unset: recruitment is off*')}`,
        ...warning,
      ].join('\n'),
    ),
    separator(),
    rolePickerRow(customId('recruit-roles'), 'Recruitment pings…', settings.recruitRoles),
    stepperRow(customId, COOLDOWN_STEPPER, settings.recruitCooldown),
  ];
};
