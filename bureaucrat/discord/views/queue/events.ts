export const QueueEvents = {
  EntriesChanged: 'queue::${queue}::entries',
  Destroyed: 'queue::${queue}::destroy',
} as const;

export const QueueEntryEvents = {
  SignupsChanged: 'qentry::${qentry}::signups',
  Destroyed: 'qentry::${qentry}::destroy',
} as const;
