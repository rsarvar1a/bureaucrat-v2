import { ButtonStyle, ComponentType } from 'discord.js';

type Node = { type?: number; style?: number; components?: Node[]; accessory?: Node; [key: string]: unknown };

/** A link button goes somewhere without asking the bot; anything else with a press or a pick does. */
const isControl = (node: Node): boolean =>
  node.type === ComponentType.Button
    ? node.style !== ButtonStyle.Link
    : node.type === ComponentType.StringSelect ||
      node.type === ComponentType.UserSelect ||
      node.type === ComponentType.RoleSelect ||
      node.type === ComponentType.MentionableSelect ||
      node.type === ComponentType.ChannelSelect;

/**
 * A message's components (API JSON) with every control taken out: what is
 * left reads as it did and answers nothing. An emptied row or container goes
 * too, and a section whose accessory was a control gives way to its text,
 * since a section cannot stand without one. Pure, so it can be tested.
 */
export const stripControls = (components: readonly unknown[]): unknown[] => {
  const strip = (nodes: readonly Node[]): Node[] =>
    nodes.flatMap((node): Node[] => {
      if (isControl(node)) return [];

      switch (node.type) {
        case ComponentType.ActionRow:
        case ComponentType.Container: {
          const children = strip(node.components ?? []);
          return children.length > 0 ? [{ ...node, components: children }] : [];
        }
        case ComponentType.Section:
          return node.accessory && isControl(node.accessory) ? (node.components ?? []) : [node];
        default:
          return [node];
      }
    });

  return strip(components as Node[]);
};
