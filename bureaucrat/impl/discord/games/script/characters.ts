import roles from './data/roles.json';

export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveler' | 'fabled' | 'loric';

/** What a character does at night, when the script says: a wake-up priority and a Storyteller reminder per night. */
export type NightNotes = { first?: number; other?: number; firstReminder?: string; otherReminder?: string };

export type Character = { id: string; name: string; team: Team | 'unknown'; night?: NightNotes };

/** `edition` is the release data's: `tb`, `bmr`, `snv`, `carousel` for the experimental set, `fabled`, `loric`. */
export type Official = {
  name: string;
  team: Team;
  edition: string;
  firstNightReminder?: string;
  otherNightReminder?: string;
};

/** The script tool's id for a character: its name, lowercased, with everything but letters and digits dropped. */
export const normalizeId = (raw: string): string => raw.toLowerCase().replace(/[^a-z0-9]/g, '');

const teamOf = (raw: string): Team => (raw === 'traveller' ? 'traveler' : (raw as Team));

/** Every official character, from the release data (see `data/README.md`). */
export const OFFICIAL: Record<string, Official> = Object.fromEntries(
  roles.map((role) => [
    role.id,
    {
      name: role.name,
      team: teamOf(role.team),
      edition: role.edition,
      ...('firstNightReminder' in role && role.firstNightReminder
        ? { firstNightReminder: role.firstNightReminder }
        : {}),
      ...('otherNightReminder' in role && role.otherNightReminder
        ? { otherNightReminder: role.otherNightReminder }
        : {}),
    },
  ]),
);

export const TEAM_ORDER: readonly (Team | 'unknown')[] = [
  'townsfolk',
  'outsider',
  'minion',
  'demon',
  'traveler',
  'fabled',
  'loric',
  'unknown',
];

export const TEAM_LABEL: Record<Team | 'unknown', string> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsiders',
  minion: 'Minions',
  demon: 'Demons',
  traveler: 'Travelers',
  fabled: 'Fabled',
  loric: 'Loric',
  unknown: 'Other',
};
