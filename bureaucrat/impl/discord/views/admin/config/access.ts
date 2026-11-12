import { rolePickerRow, roleList } from '../../../../../engine/discord/components/role-picker';
import { text, separator, select, selectRow } from '../../../../../engine/discord/elements';
import type { ViewRow } from '../../../../../engine/discord/views/types';
import type { AccessConfig } from '../../../../acl/archetypes';
import { ARCHETYPES, type Archetype } from './archetypes';

/**
 * A line per archetype with its roles, then a select for which one to edit
 * and, once one is picked, the roles select for it.
 */
export const renderAccess = <S>(view: ViewRow<S>, config: AccessConfig, picked: Archetype | null) => {
  const customId = (action: string) => view.customId(action as Parameters<typeof view.customId>[0]);

  return [
    text('### Access'),
    text(ARCHETYPES.map((a) => `**${a.label}** · ${roleList(config[a.key], '*unset*')}`).join('\n')),
    separator(),
    selectRow(
      select(customId('archetype'), 'Select an archetype…').addOptions(
        ARCHETYPES.map((a) => ({ label: a.label, value: a.key, description: a.about, default: a.key === picked })),
      ),
    ),
    ...(picked ? [rolePickerRow(customId('roles'), 'Select roles…', config[picked])] : []),
  ];
};
