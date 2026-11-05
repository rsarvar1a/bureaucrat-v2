import { Client, GatewayIntentBits } from 'discord.js';
import { handlers } from './registry/handlers';
import { rejectOnRateLimit } from './rest/reject';

export const client = new Client({
  // GuildExpressions keeps the emote cache current, so a role emote added
  // to a server shows up without a restart.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // Off except where a caller asks (`rest/reject.ts`): everything else waits a limit out.
  rest: { rejectOnRateLimit },
});

handlers.forEach((handler) => handler.registerTo(client));
