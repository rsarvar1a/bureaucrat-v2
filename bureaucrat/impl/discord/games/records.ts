import { ALIGNMENT_LABEL, defaultAlignment, type Alignment, type TeamOf } from './script/alignment';

/** A game as it stands in one member's record: `listGameRecordsByMember`, shaped for the page. */
export type GameRecord = {
  id: string;
  name: string;
  state: 'signups' | 'running' | 'completed';
  channel: bigint | null;
  winner: Alignment | null;
  endedAt: Date | null;
  createdAt: Date;
  role: 'Player' | 'Storyteller' | 'Kibitzer';
  trueRole: string | null;
  trueAlignment: Alignment | null;
  wonAs: Alignment | null;
  won: boolean;
};

export type Grouping = 'state' | 'role';
export type Filter = 'all' | 'signups' | 'running' | 'completed' | 'player' | 'storyteller' | 'won' | 'lost';
export type Sort = 'created' | 'ended' | 'name';

export const GROUPINGS: Grouping[] = ['state', 'role'];
export const SORTS: Sort[] = ['created', 'ended', 'name'];
/** The filters the kibitz list offers: by state only. */
export const STATE_FILTERS: Filter[] = ['all', 'signups', 'running', 'completed'];
export const FILTERS: Filter[] = [...STATE_FILTERS, 'player', 'storyteller', 'won', 'lost'];

export const GROUPING_LABEL: Record<Grouping, string> = { state: 'Group by state', role: 'Group by role' };
export const SORT_LABEL: Record<Sort, string> = {
  created: 'Sort by start',
  ended: 'Sort by end',
  name: 'Sort by name',
};
export const FILTER_LABEL: Record<Filter, string> = {
  all: 'Everything',
  signups: 'Taking signups',
  running: 'In progress',
  completed: 'Finished',
  player: 'As a Player',
  storyteller: 'As a Storyteller',
  won: 'Won',
  lost: 'Lost',
};

const STATE_ORDER: GameRecord['state'][] = ['signups', 'running', 'completed'];
const ROLE_ORDER: GameRecord['role'][] = ['Player', 'Storyteller', 'Kibitzer'];
const STATE_TITLE: Record<GameRecord['state'], string> = {
  signups: 'Taking signups',
  running: 'In progress',
  completed: 'Finished',
};
const ROLE_TITLE: Record<GameRecord['role'], string> = {
  Player: 'As a Player',
  Storyteller: 'As a Storyteller',
  Kibitzer: 'As a Kibitzer',
};

const isGrouping = (value: string | undefined): value is Grouping => GROUPINGS.includes(value as Grouping);
const isSort = (value: string | undefined): value is Sort => SORTS.includes(value as Sort);
const isFilter = (value: string | undefined): value is Filter => FILTERS.includes(value as Filter);
export const parse = { grouping: isGrouping, sort: isSort, filter: isFilter };

/** The team a lost game was lost with: the seat's side, else the side the winner was not. */
export const lostAs = (record: GameRecord, teamOf: TeamOf): Alignment | null =>
  record.trueAlignment ??
  defaultAlignment(teamOf(record.trueRole)) ??
  (record.winner === 'good' ? 'evil' : record.winner === 'evil' ? 'good' : null);

export const matches = (record: GameRecord, filter: Filter): boolean => {
  switch (filter) {
    case 'all':
      return true;
    case 'signups':
    case 'running':
    case 'completed':
      return record.state === filter;
    case 'player':
      return record.role === 'Player';
    case 'storyteller':
      return record.role === 'Storyteller';
    case 'won':
      return record.state === 'completed' && record.role === 'Player' && record.won;
    case 'lost':
      return record.state === 'completed' && record.role === 'Player' && !record.won;
  }
};

/** Sorted ascending by the key; `ended` puts games still going last either way. */
export const sorted = (records: GameRecord[], sort: Sort, descending: boolean): GameRecord[] => {
  const sign = descending ? -1 : 1;
  const compare = (a: GameRecord, b: GameRecord): number => {
    switch (sort) {
      case 'created':
        return sign * (a.createdAt.getTime() - b.createdAt.getTime());
      case 'name':
        return sign * a.name.localeCompare(b.name);
      case 'ended':
        if (a.endedAt === null || b.endedAt === null)
          return (a.endedAt === null ? 1 : 0) - (b.endedAt === null ? 1 : 0);
        return sign * (a.endedAt.getTime() - b.endedAt.getTime());
    }
  };
  return [...records].sort(compare);
};

export type Group = { title: string; records: GameRecord[] };

/** The records in their groups, in the groups' fixed order; a group nobody is in is left out. */
export const grouped = (records: GameRecord[], grouping: Grouping | null): Group[] => {
  if (grouping === null) return records.length > 0 ? [{ title: '', records }] : [];
  const keys = grouping === 'state' ? STATE_ORDER : ROLE_ORDER;
  const titles: Record<string, string> = grouping === 'state' ? STATE_TITLE : ROLE_TITLE;
  return keys
    .map((key) => ({
      title: titles[key]!,
      records: records.filter((r) => (grouping === 'state' ? r.state : r.role) === key),
    }))
    .filter((g) => g.records.length > 0);
};

const stamp = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:D>`;

/** What drawing a record takes: a role's icon (or its name), and which team a role is. */
export type RecordLook = { roleTag: (role: string, alignment: Alignment | null) => string; teamOf: TeamOf };

/** The lines of one entry, each but the title small. */
export const recordLines = (record: GameRecord, look: RecordLook): string[] => {
  const over = record.state === 'completed';
  const status =
    record.state === 'signups'
      ? 'taking signups'
      : record.state === 'running'
        ? 'in progress'
        : `finished on ${record.endedAt ? stamp(record.endedAt) : 'an unknown day'}`;
  const lines = [`**${record.name}**`, `-# ${record.channel !== null ? `in <#${record.channel}> · ` : ''}${status}`];
  if (record.role !== 'Kibitzer') {
    const verb = over ? 'participated' : 'participating';
    const as =
      record.role === 'Storyteller'
        ? 'the Storyteller'
        : record.trueRole
          ? `the ${look.roleTag(record.trueRole, record.trueAlignment)}`
          : 'a Player';
    lines.push(`-# ${verb} as ${as}`);
  }
  if (over && record.role === 'Player') {
    const team = record.won ? (record.wonAs ?? record.winner) : lostAs(record, look.teamOf);
    lines.push(`-# ${record.won ? 'won' : 'lost'}${team ? ` with ${ALIGNMENT_LABEL[team]}` : ''}`);
  }
  return lines;
};

export type Page = { title: string; blocks: string[] }[];

/**
 * The groups cut into pages that fit the text budget of one message, each
 * entry whole; a group that runs over continues on the next page under the
 * same title.
 */
export const paginate = (groups: { title: string; blocks: string[] }[], budget: number): Page[] => {
  const pages: Page[] = [];
  let page: Page = [];
  let used = 0;
  const flush = () => {
    if (page.length > 0) pages.push(page);
    page = [];
    used = 0;
  };
  for (const group of groups) {
    let section: Page[number] | null = null;
    for (const block of group.blocks) {
      const heading = section === null ? group.title.length + 4 : 0;
      if (used + heading + block.length + 2 > budget && used > 0) {
        flush();
        section = null;
      }
      if (section === null) {
        section = { title: group.title, blocks: [] };
        page.push(section);
        used += group.title.length + 4;
      }
      section.blocks.push(block);
      used += block.length + 2;
    }
  }
  flush();
  return pages;
};
