export const QueueEvents = {
  EntriesChanged: 'queue::${qid}::entries',
} as const;

export const QueueEntryEvents = {
  SignupsChanged: 'qentry::${qeid}::signups',
  QueueDiscovery: 'queue::${qid}',
} as const;
