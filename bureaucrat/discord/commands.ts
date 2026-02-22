import { loadDefinitions } from './frameworks/commands/loader/load-definitions';
import { buildCommandTrees } from './frameworks/commands/loader/command-trees';
import type { CommandDefinition } from './frameworks/commands/loader/types';

// Immediately available

export const commandDefinitions = await loadDefinitions();

export const commands = buildCommandTrees(commandDefinitions);

export const commandHandlers = new Map<string, CommandDefinition['func']>(
  commandDefinitions.map((def) => [def.path, def.func]),
);
