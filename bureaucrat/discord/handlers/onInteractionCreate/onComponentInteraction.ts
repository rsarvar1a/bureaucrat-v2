import type { MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { viewHandlers, viewDefinitions } from '../../views';
import { dispatch } from '../../frameworks/views/dispatch';

export default async function onComponentInteraction(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
) {
  await dispatch(interaction, viewHandlers, viewDefinitions);
}
