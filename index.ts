import 'dotenv/config';
import { deleteCommands, syncCommands } from './bureaucrat/discord/commands-framework/sync';
import { client } from './bureaucrat/discord/client';
import { commands } from './bureaucrat/discord/commands';

await syncCommands(commands, true);
await deleteCommands();

client.login(process.env.DISCORD_TOKEN!);
