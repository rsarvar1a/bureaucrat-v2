import { ButtonStyle } from 'discord.js';
import type { Tab } from '../../../../../engine/discord/components/tabs';

export type ManageTab = 'details' | 'signups' | 'delete';

export const TABS: Tab<ManageTab>[] = [
  { key: 'details', label: 'Details' },
  { key: 'signups', label: 'Signups' },
  { key: 'delete', label: 'Delete', style: ButtonStyle.Danger },
];

export const ACTIONS = [
  'edit',
  'edit-submit',
  'mode',
  'bump',
  'pdf',
  'pdf-submit',
  'pdf-remove',
  'delete',
  'delete-confirm',
  'delete-cancel',
  'filter',
  'select',
  'accept',
  'decline',
  'reset',
] as const;
