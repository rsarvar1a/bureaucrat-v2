import { commands } from '../discord/commands';
import { deleteCommands, syncCommands } from '../discord/commands-framework/loader/sync';

export async function synCommandsOnBotStartup(): Promise<void> {
  await deleteCommands();
  await syncCommands(commands, true);
}
