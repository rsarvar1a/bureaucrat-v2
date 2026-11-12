import { ButtonStyle } from 'discord.js';
import type { Tab } from '../../../../../engine/discord/components/tabs';
import { BUMP_ACTIONS } from './resources';

export type SettingsTab = 'description' | 'resources' | 'category' | 'access' | 'delete';

export const TABS: Tab<SettingsTab>[] = [
  { key: 'description', label: 'Description' },
  { key: 'resources', label: 'Resources' },
  { key: 'category', label: 'Category' },
  { key: 'access', label: 'Access' },
  { key: 'delete', label: 'Delete', style: ButtonStyle.Danger },
];

export const ACTIONS = [
  'edit',
  'edit-submit',
  'previews',
  'category',
  'archive',
  'storyteller-roles',
  'player-roles',
  'delete',
  'delete-confirm',
  'delete-cancel',
  ...BUMP_ACTIONS,
] as const;
