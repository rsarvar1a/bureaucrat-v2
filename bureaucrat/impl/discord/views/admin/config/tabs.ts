import type { Tab } from '../../../../../engine/discord/components/tabs';
import { COOLDOWN_ACTIONS } from './recruitment';

export type ConfigTab = 'access' | 'recruitment';

export const TABS: Tab<ConfigTab>[] = [
  { key: 'access', label: 'Access' },
  { key: 'recruitment', label: 'Recruitment' },
];

/** The pane's acting keys: picking an archetype is navigation, the rest write. */
export const ACTIONS = ['archetype', 'roles', 'recruit-roles', ...COOLDOWN_ACTIONS] as const;
