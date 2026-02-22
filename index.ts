import 'dotenv/config';
import { deleteCommands, syncCommands } from './bureaucrat/discord/frameworks/commands/loader/sync';
import { client } from './bureaucrat/discord/client';
import { commands } from './bureaucrat/discord/commands';

await deleteCommands();
await syncCommands(commands, true);

client.login(process.env.DISCORD_TOKEN!);
