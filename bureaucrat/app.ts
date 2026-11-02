import { commands } from './impl/discord/registry/commands';
import { viewDefinitions } from './impl/discord/registry/views';
import { commandScope, syncCommands } from './engine/discord/commands/loader/sync';
import { startSweepInterval } from './engine/discord/views/lifecycle';
import { logger } from './utilities/logger';

const initializeSlashCommands = async () => {
  const scope = commandScope();
  if (scope) await syncCommands([]);

  await syncCommands(commands, scope);

  logger.info({ message: `Published ${commands.length} command(s) ${scope ? `to guild ${scope}` : 'globally'}.` });
};

const initializeViewSweep = () => {
  startSweepInterval();
};

const setupHooks = () => [
  { name: 'load views', run: () => logger.info({ message: `Loaded ${viewDefinitions.size} view(s).` }) },
  { name: 'sync slash commands', run: initializeSlashCommands },
  { name: 'start view sweep', run: initializeViewSweep },
];

export const initialize = async () => {
  for (const hook of setupHooks()) {
    logger.debug({ message: `Startup: ${hook.name}…` });

    try {
      await Promise.resolve(hook.run());
    } catch (error) {
      logger.error({ message: `Startup failed during "${hook.name}".`, error });
      throw error;
    }
  }

  logger.info({ message: 'Startup complete; logging in.' });
};
