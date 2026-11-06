export type Alignment = 'good' | 'evil';

/** One Participant against one result of a game. */
export type ResultRow = {
  member: bigint;
  role: 'Player' | 'Storyteller' | 'Kibitzer';
  winner: Alignment;
  won: boolean;
};

/** Null when there are no games to take a rate over. */
export type Rate = { value: number; adjusted: boolean } | null;

export type PlayerRecord = {
  member: bigint;
  games: number;
  storytold: number;
  win: Rate;
  good: Rate;
  evil: Rate;
  evilShare: number | null;
};

export const RANKING_SORTS = ['games', 'win', 'good', 'evil', 'evilShare', 'storyteller'] as const;
export type RankingSort = (typeof RANKING_SORTS)[number];

export const normalized = (wins: number, games: number, threshold: number): Rate => {
  if (games === 0) return null;
  if (games >= threshold) return { value: wins / games, adjusted: false };
  // Padded up to the threshold, half of the missing games won and half lost.
  return { value: (wins + (threshold - games) / 2) / threshold, adjusted: true };
};

const opposite = (side: Alignment): Alignment => (side === 'good' ? 'evil' : 'good');

export const playerRecords = (rows: ResultRow[], threshold: number): PlayerRecord[] => {
  const tallies = new Map<
    bigint,
    { games: number; wins: number; storytold: number; good: [number, number]; evil: [number, number] }
  >();

  for (const row of rows) {
    const tally = tallies.get(row.member) ?? { games: 0, wins: 0, storytold: 0, good: [0, 0], evil: [0, 0] };
    tallies.set(row.member, tally);

    if (row.role === 'Storyteller') tally.storytold++;
    if (row.role !== 'Player') continue;

    const side = row.won ? row.winner : opposite(row.winner);
    tally.games++;
    tally[side][1]++;
    if (row.won) {
      tally.wins++;
      tally[side][0]++;
    }
  }

  return [...tallies]
    .filter(([, tally]) => tally.games > 0 || tally.storytold > 0)
    .map(([member, tally]) => ({
      member,
      games: tally.games,
      storytold: tally.storytold,
      win: normalized(tally.wins, tally.games, threshold),
      good: normalized(tally.good[0], tally.good[1], threshold),
      evil: normalized(tally.evil[0], tally.evil[1], threshold),
      evilShare: tally.games === 0 ? null : tally.evil[1] / tally.games,
    }));
};

const key = (record: PlayerRecord, sort: RankingSort): number | null => {
  switch (sort) {
    case 'games':
      return record.games;
    case 'storyteller':
      return record.storytold;
    case 'evilShare':
      return record.evilShare;
    default:
      return record[sort]?.value ?? null;
  }
};

/** A missing rate sorts last in either direction; ties go to whoever has played more. */
export const sortRecords = (records: PlayerRecord[], sort: RankingSort, descending: boolean): PlayerRecord[] =>
  [...records].sort((a, b) => {
    const [x, y] = [key(a, sort), key(b, sort)];
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
    } else if (x !== y) {
      return descending ? y - x : x - y;
    }
    if (a.games !== b.games) return b.games - a.games;
    return a.member < b.member ? -1 : a.member > b.member ? 1 : 0;
  });

const percent = (share: number): string => (share * 100).toFixed(1);

/** A cell of the ranking table, whose headers carry the `%`. */
export const rateCell = (rate: Rate): string =>
  rate === null ? '-' : `${percent(rate.value)}${rate.adjusted ? '*' : ''}`;

export const shareCell = (share: number | null): string => (share === null ? '-' : percent(share));
