import type { Tab } from '../../../../engine/discord/components/tabs';
import { S } from '../../../../strings';

export type MessagesTab = 'games' | 'users';

export const TABS: Tab<MessagesTab>[] = [
  { key: 'games', label: S.stats.messagesGames },
  { key: 'users', label: S.stats.messagesUsers },
];

export const ACTIONS = [
  'game-sort',
  'user-sort',
  'game-columns',
  'user-columns',
  'roles',
  'direction',
  'prev',
  'next',
] as const;

export const PAGE_SIZE = 15;
