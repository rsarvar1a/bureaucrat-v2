import { commands } from './discord/commands';
import { deleteCommands, syncCommands } from './discord/frameworks/commands/loader/sync';
import { startSweepInterval } from './discord/frameworks/views/lifecycle';

const initializeSlashCommands = async () => {
  await deleteCommands();
  await syncCommands(commands, true);
};

const initializeViewSweep = () => {
  startSweepInterval();
};

const setupHooks = [initializeSlashCommands, initializeViewSweep];

export const initialize = async () => {
  for (const hook of setupHooks) {
    await Promise.resolve(hook());
  }
};
