import type { Interaction } from 'discord.js';
import onChatInputCommand from './onInteractionCreate/onChatInputCommand';
import onComponentInteraction from './onInteractionCreate/onComponentInteraction';
import onAutocomplete from './onInteractionCreate/onAutocomplete';

export default async function onInteractionCreate(interaction: Interaction) {
  if (interaction.isChatInputCommand()) {
    await onChatInputCommand(interaction);
  }

  // Its own branch rather than a fall-through: an autocomplete carries a
  // half-typed command and must be answered within about three seconds, so it
  // shares none of the command path's deferring or replying.
  if (interaction.isAutocomplete()) {
    await onAutocomplete(interaction);
  }

  // Matching on the broad component predicate rather than enumerating button /
  // string-select / modal keeps user, role, channel, and mentionable selects
  // routable - enumerating them silently drops any picker we later reach for.
  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    await onComponentInteraction(interaction);
  }
}
