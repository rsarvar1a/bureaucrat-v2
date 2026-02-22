import 'dotenv/config';
import { client } from './bureaucrat/discord/client';
import { initialize } from './bureaucrat/app';

await initialize();
client.login(process.env.DISCORD_TOKEN!);
