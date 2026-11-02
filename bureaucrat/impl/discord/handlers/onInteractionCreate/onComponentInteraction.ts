import type { MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { viewHandlers, viewDefinitions } from '../../registry/views';
import { dispatch } from '../../../../engine/discord/views/dispatch';

export default async function onComponentInteraction(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
) {
  await dispatch(interaction, viewHandlers, viewDefinitions);
}
