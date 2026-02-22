import type {
  CacheType,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';

type Replyable = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction<CacheType>;
type ReplyablePayload = Parameters<Replyable['reply']>[0];

export const replySafely = async (interaction: Replyable, payload: ReplyablePayload) => {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
};
