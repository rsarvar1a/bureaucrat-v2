import { ButtonStyle } from 'discord.js';
import type { Tab } from '../../../../../engine/discord/components/tabs';

export type RoleTab = 'details' | 'bindings' | 'permissions' | 'delete';

export const TABS: Tab<RoleTab>[] = [
  { key: 'details', label: 'Details' },
  { key: 'bindings', label: 'Bindings' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'delete', label: 'Delete', style: ButtonStyle.Danger },
];

/** Every action the pane dispatches besides the strip and dismiss, for the custom-id length test. */
export const ACTIONS = [
  'edit-details',
  'edit-details-submit',
  'delete',
  'delete-confirm',
  'delete-cancel',
  'bind',
  'unbind',
  'grant-select',
  'set-allow',
  'set-default',
  'set-deny',
] as const;
