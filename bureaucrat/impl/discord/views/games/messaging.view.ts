import { ButtonStyle, type Client, type MessageComponentInteraction } from 'discord.js';
import { createView } from '../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../engine/discord/components/modal';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../engine/discord/elements';
import { toast } from '../../../../engine/discord/reply';
import type { InteractionHandler, ViewContext } from '../../../../engine/discord/views/types';
import { getGame } from '../../../../drizzle/games';
import { listManagedThreads } from '../../../../drizzle/managed-threads';
import { inGuild } from '../../guards';
import { storytells } from '../../guards/game';
import { GameEvents } from './events';

type MessagingState = Record<string, never>;

const post = async (client: Client, channelId: bigint, content: string): Promise<boolean> => {
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel || !('send' in channel)) return false;
  await channel.send({ content });
  return true;
};

const announce = modal<MessagingState>()({
  action: 'announce',
  title: 'Make an announcement',
  fields: { message: field.paragraph('Enter a message...', { maxLength: 1800 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const game = await getGame(ctx.view.entityId!);
    if (!game) return;

    const sent = await post(interaction.client, game.channel, `📣 ${values['message']!}`);

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

    let reached = 0;
    for (const row of threads) {
      if (await post(interaction.client, row.thread, values['message']!)) reached++;
    }

    await toast.followUp(interaction, `Sent to ${reached} of ${threads.length} player thread(s).`, {
      accent: accent.success,
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
          [`Send an _announcement_ into town square, or...`, `... _broadcast_ a message into each ST thread.`].join(
            '\n',
          ),
        ),
        separator(),
        buttonRow(
          button(view.customId('announce'), 'Announce', ButtonStyle.Primary),
          button(view.customId('broadcast'), 'Broadcast', ButtonStyle.Secondary).setDisabled(
            playerThreads.length === 0,
          ),
        ),
      ),
    );
  },

  interactions: {
    ...announce.interactions,
    ...broadcast.interactions,

    announce: show(announce),
    broadcast: show(broadcast),
  },
});
