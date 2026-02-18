import path from 'node:path';
import { Glob } from 'bun';
import type { CommandProvidingModule, ResolvedCommandDefinition } from './types';

/**
 * Loads the commands defined in `commands/` into definitions with automatically resolved command paths.
 * Only `*.cmd.ts` files are considered commands, allowing an implementor to flexibly place helper files or
 * implementation files in the same directory as needed.
 */
export const loadDefinitions = async (): Promise<ResolvedCommandDefinition[]> => {
  const commandRoot = 'commands';
  const root = path.join(import.meta.dir, commandRoot);
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
