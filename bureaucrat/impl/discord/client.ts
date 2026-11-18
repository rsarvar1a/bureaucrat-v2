import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { handlers } from './registry/handlers';
import { rejectOnRateLimit } from './rest/reject';

export const client = new Client({
  // GuildExpressions keeps the emote cache current, so a role emote added
  // to a server shows up without a restart. GuildMembers (privileged: switch
  // on Server Members Intent in the Developer Portal) delivers role changes,
  // and the GuildMember partial delivers them for members not yet cached.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
  // Off except where a caller asks (`rest/reject.ts`): everything else waits a limit out.
  rest: { rejectOnRateLimit },
});

handlers.forEach((handler) => handler.registerTo(client));
