import { SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import type { ResolvedCommandDefinition, Spec } from './types';

const isAddSubcommand = (spec: Spec): spec is SlashCommandBuilder | SlashCommandSubcommandGroupBuilder => {
  return spec instanceof SlashCommandBuilder || spec instanceof SlashCommandSubcommandGroupBuilder;
};

const isAddSubcommandGroup = (spec: Spec): spec is SlashCommandBuilder => {
  return spec instanceof SlashCommandBuilder;
};

const isSubcommand = (spec: Spec): spec is SlashCommandSubcommandBuilder => {
  return spec instanceof SlashCommandSubcommandBuilder;
};

const isSubcommandGroup = (spec: Spec): spec is SlashCommandSubcommandGroupBuilder => {
  return spec instanceof SlashCommandSubcommandGroupBuilder;
};

const applySpec = (parent: Spec, child: Spec) => {
  if (isSubcommand(child) && isAddSubcommand(parent)) {
    parent.addSubcommand(child);
    return;
  } else if (isSubcommandGroup(child) && isAddSubcommandGroup(parent)) {
    parent.addSubcommandGroup(child);
    return;
  }
  throw new Error(`Cannot add ${child.name} to parent ${parent.name}!`);
};

/**
 * Given a list of command definitions with their associated paths, constructs a forest of top-level `SlashCommandBuilder`s.
 */
export const buildCommandTrees = (definitions: ResolvedCommandDefinition[]): SlashCommandBuilder[] => {
  const unrolled = definitions.sort((a, b) => b.path.localeCompare(a.path)).map((def) => ({ spec: def.spec, path: def.path.split('::') }));

  unrolled
    .filter((d) => d.path.length >= 2)
    .forEach((def) => {
      const parentPath = def.path.slice(0, -1).join('::');
      const parent = unrolled.find((t) => t.path.join('::') === parentPath);
      if (!parent) throw new Error(`Parent command ${parentPath} not found for path ${def.path.join('::')}`);
      applySpec(parent.spec, def.spec);
    });

  return unrolled
    .filter((d) => d.path.length === 1)
    .map((t) => t.spec)
    .filter(isAddSubcommandGroup);
};
