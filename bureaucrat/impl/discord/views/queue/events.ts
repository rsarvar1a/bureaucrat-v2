export const QueueEvents = {
  EntriesChanged: 'queue::${queue}::entries',
  Destroyed: 'queue::${queue}::destroy',
} as const;

export const queueEvents = (queue: string) => ({
  EntriesChanged: `queue::${queue}::entries`,
  Destroyed: `queue::${queue}::destroy`,
});

export const QueueEntryEvents = {
  SignupsChanged: 'qentry::${qentry}::signups',
  Destroyed: 'qentry::${qentry}::destroy',
} as const;

export const queueEntryEvents = (entry: string) => ({
  SignupsChanged: `qentry::${entry}::signups`,
  Destroyed: `qentry::${entry}::destroy`,
});
