import { Client, GatewayIntentBits } from 'discord.js';
import { handlers } from './registry/handlers';

export const client = new Client({
  // GuildExpressions keeps the emote cache current, so a role emote added
  // to a server shows up without a restart.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

handlers.forEach((handler) => handler.registerTo(client));
