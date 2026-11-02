import { Glob } from 'bun';
import type { InteractionHandler, ViewDefinition } from './types';
import { logger } from '../../../utilities/logger';

type ViewProvidingModule = { default: ViewDefinition };

/**
 * Loads every view definition beneath `root` and registers its handlers.
 *
 * The root is passed in rather than computed. Guessing it would be an
 * engine-to-impl dependency written as a string - invisible to the typechecker
 * and to the lint rule that forbids exactly that edge.
 */
export const loadViews = async (...roots: string[]) => {
  const viewHandlers = new Map<string, InteractionHandler<unknown>>();
  const viewDefinitions = new Map<string, ViewDefinition>();

  // Several roots because content owns views too: a puzzle's apparatus lives
  // beside its POI rather than in the bot's own views folder. Ids are global,
  // so the duplicate check below deliberately spans every root.
  const files = (
    await Promise.all(
      roots.map(async (root) =>
        (await Array.fromAsync(new Glob('**/*.view.ts').scan({ cwd: root }))).map((file) => ({ root, file })),
      ),
    )
  ).flat();

  for (const { root, file } of files) {
    const module: ViewProvidingModule = await import(`${root}/${file}`);
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
