/** `/stats config`. */
export const configTitle = '### Stats';
export const configThreshold = 'Normalization threshold';
export const configBody = (threshold: number) =>
  threshold === 0
    ? 'Normalization is disabled.'
    : `Players with fewer than ${threshold} games will have their winrates normalized.`;

/** `/stats ranking`. */
export const rankingTitle = '### Player ranking';
export const rankingEmpty = '*There are no completed games in this server.*';
export const rankingSorts = {
  games: 'Games played',
  win: 'Win rate',
  good: 'Good win rate',
  evil: 'Evil win rate',
  evilShare: 'Evil rate',
  storyteller: 'Games storytold',
} as const;
export const rankingFootnote = (threshold: number) =>
  threshold === 0 ? '' : `\n-# *Players with fewer than ${threshold} games have normalized winrates.*`;

/** `/stats messages`. */
export const messagesGames = 'Games';
export const messagesUsers = 'Users';
export const gamesTitle = '### Messages by game';
export const usersTitle = '### Messages by user';
export const gamesEmpty = '*No games have been indexed in this server yet.*';
export const usersEmpty = '*Nobody has messages in those roles.*';
export const gameSorts = {
  messages: 'Message count',
  length: 'Length',
  started: 'Date started',
  ended: 'Date ended',
} as const;
export const userSorts = { messages: 'Total messages', perGame: 'Per game', perDay: 'Per day' } as const;
export const roleLabels = { Player: 'Players', Storyteller: 'Storytellers', Kibitzer: 'Kibitzers' } as const;
export const rolesPlaceholder = 'Roles to count';
export const stillReading = (games: number) => `\n-# ${games} are still being ingested.`;

export const count = (n: number, noun: string) => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

/** Column headers, and the labels of the dropdown that picks them. */
export const columns = {
  rank: '#',
  player: 'Player',
  played: 'Played',
  win: 'Win %',
  good: 'Good win %',
  evil: 'Evil win %',
  evilShare: 'Evil rate',
  storytold: 'Storytold',
  game: 'Game',
  winner: 'Winner',
  messages: 'Messages',
  threads: 'Threads',
  members: 'Members',
  days: 'Days',
  started: 'Started',
  ended: 'Ended',
  user: 'User',
  games: 'Games',
  perGame: 'Per game',
  perDay: 'Per day',
} as const;
/** The same headers when a table has to narrow to fit. */
export const shortColumns = {
  played: 'GP',
  win: 'W%',
  good: 'Good W%',
  evil: 'Evil W%',
  evilShare: 'Evil%',
  storytold: 'ST',
  messages: 'Msgs',
  threads: 'Thds',
  members: 'Mbrs',
  games: 'GP',
  perGame: '/game',
  perDay: '/day',
} as const;
export const columnsPlaceholder = 'View columns';

export const sortPlaceholder = 'Sort by';
export const descending = 'Descending';
export const ascending = 'Ascending';
export const pageOf = (page: number, pages: number) => `\n-# Page ${page + 1} of ${pages}`;
