import 'dotenv/config';
import { client } from './bureaucrat/discord/client';
import { initialize } from './bureaucrat/init';

/** SETUP HOOKS */

await initialize();

/** EVENT LOOP */

client.login(process.env.DISCORD_TOKEN!);
