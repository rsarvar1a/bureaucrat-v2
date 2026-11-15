/** The recruitment settings a server or a queue holds; a queue's empty roles or null cooldown follow the server. */
export type RecruitSettings = { recruitRoles: readonly bigint[]; recruitCooldown: number | null };

export type Recruitment = { roles: readonly bigint[]; cooldownHours: number };

/** The cooldown steppers' range, in hours; the queue's adds "server default" below it. */
export const COOLDOWN = { min: 12, max: 168, step: 12, suffix: 'h' } as const;

const HOUR_MS = 3_600_000;

/** A queue's setting replaces the server's outright, each of the two on its own. */
export const recruitmentFor = (
  server: RecruitSettings & { recruitCooldown: number },
  queue: RecruitSettings | null,
): Recruitment => ({
  roles: queue && queue.recruitRoles.length > 0 ? queue.recruitRoles : server.recruitRoles,
  cooldownHours: queue?.recruitCooldown ?? server.recruitCooldown,
});

/** When a game may recruit again; null if it never has. */
export const nextRecruitment = (last: Date | null, cooldownHours: number): Date | null =>
  last === null ? null : new Date(last.getTime() + cooldownHours * HOUR_MS);

/** The latest last recruitment that lets a game recruit at `now`. */
export const recruitCutoff = (now: Date, cooldownHours: number): Date =>
  new Date(now.getTime() - cooldownHours * HOUR_MS);
