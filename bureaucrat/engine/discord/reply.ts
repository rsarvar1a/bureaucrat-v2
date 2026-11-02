import { MessageFlags } from 'discord.js';
import type {
  CacheType,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { logger } from '../../utilities/logger';
import { accent, linear, text } from './elements';

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

export type ToastOptions = {
  timeoutMs?: number;
  /** Accent stripe colour; see `accent` in `discord/elements`. */
  accent?: number;
};

/**
 * Renders toast text as a Components V2 container rather than bare `content`,
 * so transient messages match the panels they appear beside.
 */
const body = (content: string, tone: number = accent.neutral) => linear(text(content)).setAccentColor(tone);

/**
 * Transient messages with auto-delete timeouts.
 *
 * Pick the variant by how the interaction was acknowledged:
 *
 *  - `ephemeral` edits the interaction's own reply, so it is correct for a
 *    fresh interaction or one deferred with `deferReply()`.
 *  - `followUp` sends a separate message, and is the only safe choice after
 *    `deferUpdate()`. There, `editReply` targets the *component's* message -
 *    which for a view is a Components V2 body that rejects `content` outright,
 *    and whose deletion on timeout would take the view down with it.
 */
export const toast = {
  /**
   * Do not use after `deferUpdate()` - see the note above. Use `followUp`.
   */
  async ephemeral(interaction: Replyable, content: string, options: ToastOptions = {}): Promise<void> {
    const { timeoutMs = 5_000, accent: tone } = options;
    const components = [body(content, tone)];

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ components, flags: [MessageFlags.IsComponentsV2] });
    } else {
      await interaction.reply({ components, flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] });
    }

    setTimeout(() => {
      tryDeleteReply(interaction);
    }, timeoutMs);
  },

  /**
   * A transient ephemeral message sent alongside an already-acknowledged
   * interaction, leaving the originating message untouched.
   */
  async followUp(interaction: Replyable, content: string, options: ToastOptions = {}): Promise<void> {
    const { timeoutMs = 5_000, accent: tone } = options;

    const message = await interaction.followUp({
      components: [body(content, tone)],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    });

    setTimeout(() => {
      interaction.deleteReply(message.id).catch((error: unknown) => {
        logger.debug({ message: 'Ignoring error in toast.followUp delete.', error });
      });
    }, timeoutMs);
  },
};
