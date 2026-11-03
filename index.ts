import 'dotenv/config';
import { client } from './bureaucrat/impl/discord/client';
import { initialize } from './bureaucrat/app';
import { logger } from './bureaucrat/utilities/logger';

await initialize();

await client.login(process.env.DISCORD_TOKEN!).catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);

  if (/disallowed intents/i.test(detail)) {
    logger.error({
      message: [
        'Discord refused the connection: this bot requests a privileged intent that is not enabled.',
        'Enable "Message Content Intent" under Bot -> Privileged Gateway Intents in the developer portal,',
        'or drop GatewayIntentBits.MessageContent from bureaucrat/impl/discord/client.ts.',
      ].join('\n'),
    });
  } else {
    logger.error({ message: 'Failed to log in to Discord.', error });
  }

  process.exit(1);
});
