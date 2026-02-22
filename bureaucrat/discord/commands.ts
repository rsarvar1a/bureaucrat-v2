import { loadDefinitions } from './commands-framework/loader/load-definitions';
import { buildCommandTrees } from './commands-framework/loader/command-trees';
import type { CommandDefinition } from './commands-framework/loader/types';

// Immediately available

export const commandDefinitions = await loadDefinitions();

export const commands = buildCommandTrees(commandDefinitions);

export const commandHandlers = new Map<string, CommandDefinition['func']>(
  commandDefinitions.map((def) => [def.path, def.func]),
);
