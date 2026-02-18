import { loadDefinitions } from './commands-framework/load-definitions';
import { buildCommandTrees } from './commands-framework/command-trees';
import type { CommandDefinition } from './commands-framework/types';

// Immediately available

export const commandDefinitions = await loadDefinitions();

export const commands = buildCommandTrees(commandDefinitions);

export const commandHandlers = new Map<string, CommandDefinition['func']>(commandDefinitions.map((def) => [def.path, def.func]));
