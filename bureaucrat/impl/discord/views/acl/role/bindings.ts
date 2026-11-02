import {
  text,
  separator,
  linear,
  select,
  selectRow,
  mentionableSelect,
  mentionableSelectRow,
} from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { AclBinding } from '../../../../../schema/acl/grants.sql';

type Binding = typeof AclBinding.$inferSelect;

/** Who a binding reaches, as a mention. */
export const bindingTarget = (binding: Binding) => (binding.role ? `<@&${binding.role}>` : `<@${binding.member}>`);

/** Where a binding applies. */
export const bindingScope = (binding: Binding) =>
  binding.locationDomain ? `${binding.locationDomain}:${binding.locationId}` : 'server-wide';

export const bindingLines = (bindings: Binding[]) =>
  bindings.length === 0
    ? '*No bindings yet.*'
    : bindings.map((b) => `- ${bindingTarget(b)} (${bindingScope(b)})`).join('\n');

/**
 * The Bindings tab: the list, a picker to add, and a picker to remove.
 *
 * Removal is a select rather than a button per binding: the button rows grew
 * with the binding count, and a tabbed pane has a row budget to keep.
 */
export const renderBindings = (
  view: ViewRow<unknown>,
  roleName: string,
  bindings: Binding[],
): { body: Parameters<typeof linear>; controls: Parameters<typeof linear> } => {
  const body = [text(`### Bindings: ${roleName}`), separator(), text(bindingLines(bindings)), separator()];

  const adder = mentionableSelectRow(mentionableSelect(view.customId('bind'), 'Add a role or member'));

  const remover =
    bindings.length > 0
      ? [
          selectRow(
            select(view.customId('unbind'), 'Remove a binding').addOptions(
              bindings.slice(0, 25).map((b) => ({
                // Option labels cannot carry mentions; the kind and scope are what
                // tells two bindings apart at a glance, and the list above has the names.
                label: `${b.role ? 'Role' : 'Member'} ${b.role ?? b.member} · ${bindingScope(b)}`.slice(0, 100),
                value: b.id,
              })),
            ),
          ),
        ]
      : [];

  return { body, controls: [adder, ...remover] };
};
