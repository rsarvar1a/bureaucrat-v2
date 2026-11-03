import path from 'node:path';
import { Glob } from 'bun';
import type { CommandProvidingModule, ResolvedCommandDefinition } from './types';

/**
 * Loads the commands beneath `root` into definitions with resolved command paths.
 *
 * Only `*.cmd.ts` files count, so an implementor may keep helpers beside them.
 * The root is passed in rather than computed, for the reason given in
 * `views/loader.ts`: a guessed path is an engine-to-impl edge nothing can see.
 */
export const loadDefinitions = async (root: string): Promise<ResolvedCommandDefinition[]> => {
  const glob = await Array.fromAsync(new Glob('**/*.cmd.ts').scan({ cwd: root }));

  const resolvedDefinitions = glob.map(async (file) => {
    const module: CommandProvidingModule = await import(`${root}/${file}`);
    const cmdpath = path
      .relative(root, `${root}/${file}`)
      .replace(/\.cmd\.ts$/, '')
      .replaceAll('/', '::');

    module.default.spec.setName(cmdpath.split('::').slice(-1)[0]!);
    return { ...module.default, path: cmdpath };
  });

  const defs = await Promise.all<ResolvedCommandDefinition>(resolvedDefinitions);
  return defs.sort((a, b) => a.path.localeCompare(b.path));
};
