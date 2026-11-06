import { dismissButton } from '../../../../engine/discord/components/dismiss';
import { bump, nudges, stepperRow, type Nudge, type Stepper } from '../../../../engine/discord/components/stepper';
import { createView } from '../../../../engine/discord/views/create-view';
import { linear, separator, text, v2 } from '../../../../engine/discord/elements';
import type { InteractionHandler, ViewGuard } from '../../../../engine/discord/views/types';
import { getOrCreateGuildSettings, updateGuildSettings } from '../../../../drizzle/guild-settings';
import { Permissions } from '../../../acl/permissions';
import { can, inGuild } from '../../guards';
import { S } from '../../../../strings';

type ConfigState = Record<string, never>;

const dismiss = dismissButton<ConfigState>()({ action: 'dismiss' });

const THRESHOLD: Stepper = { slug: 'norm', label: S.stats.configThreshold, min: 0, max: 50, bigStep: 5 };

const pressOf = (nudge: Nudge) => `bump:${THRESHOLD.slug}:${nudge}`;

const presses: Record<string, InteractionHandler<ConfigState>> = Object.fromEntries(
  nudges(THRESHOLD).map((nudge) => [
    pressOf(nudge),
    (async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      if (ctx.view.entityId !== interaction.guildId) return { action: 'render' };

      const guild = BigInt(interaction.guildId!);
      const { statsNormalization } = await getOrCreateGuildSettings(guild);
      await updateGuildSettings(guild, { statsNormalization: bump(THRESHOLD, statsNormalization, nudge) ?? 0 });
      return { action: 'render' };
    }) satisfies InteractionHandler<ConfigState>,
  ]),
);

const manages: ViewGuard[] = [can(Permissions.Server.Manage)];

/** The server's stats settings, in an ephemeral pane. Gated on `server.manage` at the gate and on each press. */
export default createView<ConfigState>()({
  id: 'statsconfig',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: {},
  guards: {
    '*': [inGuild],
    ...Object.fromEntries(nudges(THRESHOLD).map((nudge) => [pressOf(nudge), manages])),
  },

  render: async (view) => {
    const { statsNormalization } = await getOrCreateGuildSettings(BigInt(view.entityId!));
    return v2(
      linear(
        text(S.stats.configTitle),
        text(S.stats.configBody(statsNormalization)),
        stepperRow(
          (action) => view.customId(action as Parameters<typeof view.customId>[0]),
          THRESHOLD,
          statsNormalization,
        ),
        separator(),
        dismiss.row(view),
      ),
    );
  },

  interactions: { ...dismiss.interactions, ...presses },
});
