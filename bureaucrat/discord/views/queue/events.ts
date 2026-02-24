export const QueueEvents = {
  EntriesChanged: 'queue::${queue}::entries',
} as const;

export const QueueEntryEvents = {
  SignupsChanged: 'qentry::${qentry}::signups',
  QueueDiscovery: 'queue::${queue}',
} as const;
