import path from 'node:path';
import { Glob } from 'bun';
import type { InteractionHandler, ViewDefinition } from './types';
import { logger } from '../../../utilities/logger';

type ViewProvidingModule = { default: ViewDefinition };

/**
 * Loads all view definitions from `views/` and registers their interaction handlers.
 */
export const loadViews = async () => {
  const viewRoot = path.join(import.meta.dir, '..', '..', 'views');
  const glob = await Array.fromAsync(new Glob('**/*.view.ts').scan({ cwd: viewRoot }));

  const viewHandlers = new Map<string, InteractionHandler<unknown>>();
  const viewDefinitions = new Map<string, ViewDefinition>();

  for (const file of glob) {
    const module: ViewProvidingModule = await import(`${viewRoot}/${file}`);
    const viewDef = module.default;

    if (viewDefinitions.has(viewDef.id)) {
      throw new Error(`Duplicate view ID "${viewDef.id}" from file "${file}".`);
    }

    viewDefinitions.set(viewDef.id, viewDef);

    // Register each interaction handler
    for (const [actionKey, handler] of Object.entries(viewDef.interactions)) {
      const handlerPath = `view::${viewDef.id}::${actionKey}`;
      viewHandlers.set(handlerPath, handler);
    }

    logger.debug({
      message: `Loaded view "${viewDef.id}" with ${Object.keys(viewDef.interactions).length} interaction(s).`,
    });
  }

  return { viewHandlers, viewDefinitions };
};
