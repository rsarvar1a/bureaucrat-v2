import { ButtonStyle, type Client, type MessageComponentInteraction } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../engine/discord/components/modal';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import type { InteractionHandler, ViewContext } from '../../../../engine/discord/views/types';
import { getGame } from '../../../../drizzle/games';
import { listManagedThreads } from '../../../../drizzle/managed-threads';
import { actorOf } from '../../access';
import { recruit, recruitReply } from '../../games/recruitment/recruit';
import { trackedRoles } from '../../games/roles';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { GameEvents } from './events';

type MessagingState = Record<string, never>;

/**
 * Posts a Storyteller's words as the bot. Members and the game's own roles may
 * ring; nothing else, so a bot granted Mention All Roles for recruitment does
 * not hand an @everyone to whoever storytells.
 */
const post = async (client: Client, channelId: bigint, content: string, roles: string[]): Promise<boolean> => {
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel || !('send' in channel)) return false;
  await channel.send({ content, allowedMentions: { parse: ['users'], roles } });
  return true;
};

const gameRoleIds = async (gameId: string) => Object.values(await trackedRoles(gameId)).map(String);

const announce = modal<MessagingState>()({
  action: 'announce',
  title: 'Make an announcement',
  fields: { message: field.paragraph('Enter a message...', { maxLength: 1800 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const game = await getGame(ctx.view.entityId!);
    if (!game) return;

    const sent = await post(interaction.client, game.channel, `📣 ${values['message']!}`, await gameRoleIds(game.id));

    await toast.followUp(interaction, sent ? `Posted in <#${game.channel}>.` : 'The game channel is unreachable.', {
      accent: sent ? accent.success : accent.danger,
    });
  },
});

const broadcast = modal<MessagingState>()({
  action: 'broadcast',
  title: 'Broadcast to ST threads',
  fields: { message: field.paragraph('Enter a message...', { maxLength: 1800 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const threads = await listManagedThreads(ctx.view.entityId!, 'ST thread');
    if (threads.length === 0) {
      await toast.followUp(interaction, 'There are no player threads to reach yet.', { accent: accent.warning });
      return;
    }

    const roles = await gameRoleIds(ctx.view.entityId!);
    let reached = 0;
    for (const row of threads) {
      if (await post(interaction.client, row.thread, values['message']!, roles)) reached++;
    }

    await toast.followUp(interaction, `Sent to ${reached} of ${threads.length} player thread(s).`, {
      accent: accent.success,
    });
  },
});

const recruitment = modal<MessagingState>()({
  action: 'recruit',
  title: 'Recruit players',
  fields: { note: field.paragraph('A line to go with the ping (optional)', { required: false, maxLength: 1500 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const game = await getGame(ctx.view.entityId!);
    const actor = actorOf(interaction);
    if (!game || !actor) return;

    const reply = recruitReply(
      await recruit(interaction.client, game, actor.id, values['note']?.trim() || null),
      game.channel,
    );
    await toast.followUp(interaction, reply.message, {
      accent: reply.ok ? accent.success : accent.warning,
      timeoutMs: 15_000,
    });
  },
});

type Form = { show: (interaction: MessageComponentInteraction, ctx: ViewContext<MessagingState>) => Promise<void> };

const show =
  (form: Form): InteractionHandler<MessagingState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await form.show(interaction, ctx);
  };

export default createView<MessagingState>()({
  id: 'gmessaging',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [GameEvents.Changed], detach: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const game = await getGame(view.entityId!);
    if (!game) return v2(linear(text('Game not found.')).setAccentColor(accent.danger));

    const playerThreads = await listManagedThreads(game.id, 'ST thread');

    return v2(
      linear(
        text('### Messaging'),
        text(
          [
            `Send an _announcement_ into town square, or...`,
            `... _broadcast_ a message into each ST thread, or...`,
            `... _recruit_: ping the server's recruitment roles, while the game takes signups.`,
          ].join('\n'),
        ),
        separator(),
        buttonRow(
          button(view.customId('announce'), 'Announce', ButtonStyle.Primary),
          button(view.customId('broadcast'), 'Broadcast', ButtonStyle.Secondary).setDisabled(
            playerThreads.length === 0,
          ),
          button(view.customId('recruit'), 'Recruit', ButtonStyle.Success).setDisabled(game.state !== 'signups'),
        ),
      ),
    );
  },

  interactions: {
    ...announce.interactions,
    ...broadcast.interactions,
    ...recruitment.interactions,

    announce: show(announce),
    broadcast: show(broadcast),
    recruit: show(recruitment),
  },
});
