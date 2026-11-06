export type Role = 'Player' | 'Storyteller' | 'Kibitzer';
export const ROLES: Role[] = ['Player', 'Storyteller', 'Kibitzer'];

/** Per game and per day mean little over a few messages. */
export const MINIMUM_MESSAGES = 500;

const DAY_MS = 86_400_000;

/** A game is at least a day, so one over within hours cannot dominate. */
export const daysOf = (firstAt: Date | null, lastAt: Date | null): number =>
  firstAt === null || lastAt === null ? 1 : Math.max((lastAt.getTime() - firstAt.getTime()) / DAY_MS, 1);

export type LargestExport = { id: string; game: string; messages: number };
export type StoredStats = { game: string; export: string; exportMessages: number };

/** The exports a game's stored counts no longer describe. An export with nothing read yet has nothing to count. */
export const staleExports = <E extends LargestExport>(largest: E[], stored: StoredStats[]): E[] => {
  const held = new Map(stored.map((row) => [row.game, row]));
  return largest.filter((exp) => {
    if (exp.messages === 0) return false;
    const row = held.get(exp.game);
    return !row || row.export !== exp.id || row.exportMessages !== exp.messages;
  });
};

export const GAME_SORTS = ['messages', 'length', 'started', 'ended'] as const;
export type GameSort = (typeof GAME_SORTS)[number];

export type GameStats = {
  game: string;
  name: string;
  winner: string | null;
  messages: number;
  threads: number;
  authors: number;
  firstAt: Date | null;
  lastAt: Date | null;
};

const gameKey = (game: GameStats, sort: GameSort): number | null => {
  switch (sort) {
    case 'messages':
      return game.messages;
    case 'length':
      return game.firstAt === null ? null : daysOf(game.firstAt, game.lastAt);
    case 'started':
      return game.firstAt?.getTime() ?? null;
    case 'ended':
      return game.lastAt?.getTime() ?? null;
  }
};

const compare = (x: number | null, y: number | null, descending: boolean): number => {
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return descending ? y - x : x - y;
};

export const sortGames = (games: GameStats[], sort: GameSort, descending: boolean): GameStats[] =>
  [...games].sort(
    (a, b) => compare(gameKey(a, sort), gameKey(b, sort), descending) || a.name.localeCompare(b.name) || 0,
  );

export type MemberRow = {
  game: string;
  member: bigint;
  played: number;
  role: Role | null;
  firstAt: Date | null;
  lastAt: Date | null;
};

export const USER_SORTS = ['messages', 'perGame', 'perDay'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export type UserStats = { member: bigint; messages: number; games: number; perGame: number; perDay: number };

/**
 * What each user said while in one of `roles`; no recorded role is a Kibitzer.
 * Per day is their rate in each game, weighted by their own messages in it.
 */
export const userStats = (rows: MemberRow[], roles: Role[]): UserStats[] => {
  const tallies = new Map<bigint, { messages: number; games: number; weighted: number }>();

  for (const row of rows) {
    if (row.played === 0 || !roles.includes(row.role ?? 'Kibitzer')) continue;
    const tally = tallies.get(row.member) ?? { messages: 0, games: 0, weighted: 0 };
    tally.messages += row.played;
    tally.games++;
    tally.weighted += (row.played * row.played) / daysOf(row.firstAt, row.lastAt);
    tallies.set(row.member, tally);
  }

  return [...tallies].map(([member, tally]) => ({
    member,
    messages: tally.messages,
    games: tally.games,
    perGame: tally.messages / tally.games,
    perDay: tally.weighted / tally.messages,
  }));
};

export const sortUsers = (users: UserStats[], sort: UserSort, descending: boolean): UserStats[] =>
  users
    .filter((user) => sort === 'messages' || user.messages >= MINIMUM_MESSAGES)
    .sort((a, b) => compare(a[sort], b[sort], descending) || b.messages - a.messages);

export const parseRoles = (held: unknown): Role[] => {
  const roles = Array.isArray(held) ? ROLES.filter((role) => held.includes(role)) : [];
  return roles.length > 0 ? roles : ROLES;
};
