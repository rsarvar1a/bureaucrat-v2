import type { Interaction } from 'discord.js';
import onChatInputCommand from './onInteractionCreate/onChatInputCommand';

export default async function onInteractionCreate(interaction: Interaction) {
  if (interaction.isChatInputCommand()) {
    await onChatInputCommand(interaction);
  } // etc. for other interaction types
}
