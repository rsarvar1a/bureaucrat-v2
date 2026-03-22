import type {
  CacheType,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { logger } from './logger';

type Replyable = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction<CacheType>;
type ReplyablePayload = Parameters<Replyable['reply']>[0];
type EditReplyPayload = Parameters<Replyable['editReply']>[0];

export const replySafely = async (interaction: Replyable, payload: ReplyablePayload) => {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
};

export const tryDeleteReply = async (interaction: Replyable): Promise<void> => {
  try {
    await interaction.deleteReply();
  } catch (error) {
    logger.debug({ message: 'Ignoring error in tryDeleteReply.', error });
  }
};

export const tryEditReply = async (interaction: Replyable, payload: EditReplyPayload): Promise<void> => {
  try {
    await interaction.editReply(payload);
  } catch (error) {
    logger.debug({ message: 'Ignoring error in tryEditReply.', error });
  }
};

export const tryDeferUpdate = async (
  interaction: MessageComponentInteraction | ModalSubmitInteraction<CacheType>,
): Promise<void> => {
  try {
    await interaction.deferUpdate();
  } catch (error) {
    logger.debug({ message: 'Ignoring error in tryDeferUpdate.', error });
  }
};

/**
 * Content-only messages with auto-delete timeouts.
 */
export const toast = {
  async ephemeral(interaction: Replyable, content: string, timeoutMs: number = 5_000): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }

    setTimeout(() => {
      tryDeleteReply(interaction);
    }, timeoutMs);
  },

  async public(interaction: Replyable, content: string, timeoutMs: number = 5_000): Promise<void> {
    let message;
    if (interaction.replied || interaction.deferred) {
      message = await interaction.editReply({ content });
    } else {
      message = await interaction.reply({ content, fetchReply: true });
    }

    setTimeout(() => {
      message.delete().catch((error: unknown) => {
        logger.debug({ message: 'Ignoring error in toast.public delete.', error });
      });
    }, timeoutMs);
  },
};
