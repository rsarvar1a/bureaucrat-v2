import { Client, GatewayIntentBits } from 'discord.js';
import { handlers } from './handlers';

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

handlers.forEach((handler) => handler.registerTo(client));
