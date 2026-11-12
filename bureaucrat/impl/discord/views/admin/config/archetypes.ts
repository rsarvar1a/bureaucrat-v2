import type { AccessConfig } from '../../../../acl/archetypes';

export type Archetype = keyof AccessConfig;

/** In the order the pane lists them; `about` is the select option's description (100 characters at most). */
export const ARCHETYPES: { key: Archetype; label: string; about: string }[] = [
  { key: 'manager', label: 'Manager', about: 'Anything. Manage Server and Administrator always count.' },
  {
    key: 'moderator',
    label: 'Moderator',
    about: 'Runs any game, manages queue entries, archives. Not settings or queues.',
  },
  { key: 'storyteller', label: 'Storyteller', about: 'When set, needed to enter a queue or sign up as a Storyteller.' },
  { key: 'player', label: 'Player', about: 'When set, needed to sign up as a Player or Kibitzer.' },
];

export const isArchetype = (value: string | undefined): value is Archetype => ARCHETYPES.some((a) => a.key === value);

/** The pane's acting keys: picking an archetype is navigation, picking its roles writes. */
export const ACTIONS = ['archetype', 'roles'] as const;
