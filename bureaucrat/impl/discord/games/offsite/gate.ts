import { rejectingRateLimits, waitOf } from '../../rest/reject';

/**
 * Discord lets a server gain only so many threads at a time (twenty in five
 * minutes, as observed), and a copy cannot fill a thread before making it.
 * Waiting that out would hold a writer's slot for minutes doing nothing, so
 * a copy that meets the limit is `Deferred` instead: it hands its slot back
 * and is not claimed again until the window opens.
 */
export class Deferred extends Error {
  constructor(readonly until: Date) {
    super(`Deferred until ${until.toISOString()}: Discord's thread limit.`);
    this.name = 'Deferred';
  }
}

/** Longer than this, a thread limit is given back as a deferral rather than waited. */
export const THREAD_PATIENCE_MS = 10_000;

type Limited = { timeToReset: number; retryAfter: number; sublimitTimeout: number };
const limitOf = (error: unknown): Limited | null =>
  error instanceof Error && error.name.startsWith('RateLimitError') ? (error as unknown as Limited) : null;

/**
 * When each server's thread window opens again, learned from the limit
 * itself. Copies to a server whose window is shut defer without a request,
 * so the limit is met once per window and not once per writer: a refused
 * request counts against Discord's invalid-request ceiling.
 */
export class ThreadGate {
  readonly #opensAt = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}

  opensAt(guild: string): Date | null {
    const at = this.#opensAt.get(guild);
    return at !== undefined && at > this.now() ? new Date(at) : null;
  }

  async create<T>(guild: string, make: () => Promise<T>): Promise<T> {
    const shut = this.opensAt(guild);
    if (shut) throw new Deferred(shut);
    try {
      return await rejectingRateLimits(THREAD_PATIENCE_MS, make);
    } catch (error) {
      const limited = limitOf(error);
      if (!limited) throw error;
      const at = this.now() + waitOf(limited);
      this.#opensAt.set(guild, Math.max(this.#opensAt.get(guild) ?? 0, at));
      throw new Deferred(new Date(at));
    }
  }
}

export const threadGate = new ThreadGate();
