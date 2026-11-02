import path from 'node:path';
import { loadDefinitions } from '../../../engine/discord/commands/loader/load-definitions';
import { buildCommandTrees } from '../../../engine/discord/commands/loader/command-trees';
import type { CommandDefinition } from '../../../engine/discord/commands/loader/types';

// Immediately available

export const commandDefinitions = await loadDefinitions(path.join(import.meta.dir, '..', 'commands'));

export const commands = buildCommandTrees(commandDefinitions);

export const commandHandlers = new Map<string, CommandDefinition['func']>(
  commandDefinitions.map((def) => [def.path, def.func]),
);

/**
 * The same map for options that answer live, keyed the same way.
 *
 * Sparse on purpose: most commands have nothing to suggest, and a missing entry
 * is how the router tells "this option does not complete" from "its suggester
 * returned nothing".
 */
export const autocompleteHandlers = new Map<string, NonNullable<CommandDefinition['complete']>>(
  commandDefinitions.filter((def) => def.complete !== undefined).map((def) => [def.path, def.complete!]),
);
