import { Glob } from 'bun';
import path from 'node:path';
import {
  REST,
  Routes,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

export const noop = () => {};

export type CommandDefinition = {
  spec: SlashCommandBuilder | SlashCommandSubcommandGroupBuilder | SlashCommandSubcommandBuilder;
  func: (interaction: ChatInputCommandInteraction, ...args: unknown[]) => void | Promise<void>;
};

// Dynamically loading a command forest

type CommandProvidingModule = { default: CommandDefinition };
type ResolvedCommandDefinition = CommandDefinition & { path: string };
type UnrolledCommandDefinition<T extends CommandDefinition['spec']> = {
  spec: T;
  path: string[];
};

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

/**
 * Given a list of command definitions with their associated paths, constructs a forest of top-level `SlashCommandBuilder`s.
 */
export const commandForest = (definitions: ResolvedCommandDefinition[]): SlashCommandBuilder[] => {
  const unrolled = definitions.sort((a, b) => b.path.localeCompare(a.path)).map((def) => ({ spec: def.spec, path: def.path.split('::') }));
  const toplevels = unrolled.filter((d) => d.path.length === 1) as UnrolledCommandDefinition<SlashCommandBuilder>[];
  const nesteds = unrolled.filter((d) => d.path.length >= 2) as UnrolledCommandDefinition<
    SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder
  >[];

  nesteds.forEach((def) => {
    const parentPath = def.path.slice(0, -1).join('::');
    const parent = unrolled.find((t) => t.path.join('::') === parentPath);
    if (!parent) throw new Error(`Parent command ${parentPath} not found for path ${def.path.join('::')}`);

    switch (parent.spec.constructor.name) {
      case 'SlashCommandBuilder': {
        if (def.spec instanceof SlashCommandSubcommandBuilder) {
          (parent.spec as SlashCommandBuilder).addSubcommand(def.spec);
        } else {
          (parent.spec as SlashCommandBuilder).addSubcommandGroup(def.spec);
        }
        break;
      }
      case 'SlashCommandSubcommandGroupBuilder': {
        if (def.spec instanceof SlashCommandSubcommandBuilder) {
          (parent.spec as SlashCommandSubcommandGroupBuilder).addSubcommand(def.spec);
        } else if (def.spec instanceof SlashCommandSubcommandGroupBuilder) {
          throw new Error(`Cannot add subcommand group to subcommand group for path ${def.path.join('::')}`);
        }
        break;
      }
    }
  });

  return toplevels.map((t) => t.spec);
};

/**
 * Push a command forest up to Discord.
 */
export const syncCommands = async (commands: SlashCommandBuilder[], develop?: true) => {
  if (develop && !process.env.DISCORD_GUILD_ID) {
    console.warn('Tried to sync commands to development guild, but DISCORD_GUILD_ID is not set; falling back to global.');
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route =
    develop && process.env.DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
      : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
};

// Immediately available

export const commandDefinitions = await loadDefinitions();

export const commands = commandForest(commandDefinitions);

export const commandHandlers = new Map<string, CommandDefinition['func']>(commandDefinitions.map((def) => [def.path, def.func]));
