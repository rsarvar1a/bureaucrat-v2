import { synCommandsOnBotStartup } from './commands';
import { deleteExpiredInteractionSessionsJob } from './session-timeouts';

type InitHook = () => Promise<void> | void;

const hooks: InitHook[] = [synCommandsOnBotStartup, deleteExpiredInteractionSessionsJob];

export const initialize = async () => {
  for (const hook of hooks) {
    await Promise.resolve(hook());
  }
};
