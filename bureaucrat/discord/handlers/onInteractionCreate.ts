import type { Interaction } from 'discord.js';
import onChatInputCommand from './onInteractionCreate/onChatInputCommand';
import onComponentInteraction from './onInteractionCreate/onComponentInteraction';

export default async function onInteractionCreate(interaction: Interaction) {
  if (interaction.isChatInputCommand()) {
    await onChatInputCommand(interaction);
  }

  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    await onComponentInteraction(interaction);
  }
}
