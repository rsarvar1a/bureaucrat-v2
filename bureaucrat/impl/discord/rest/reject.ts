import { AsyncLocalStorage } from 'node:async_hooks';
import type { RateLimitData } from 'discord.js';

/**
 * discord.js waits out a rate limit by default, holding the caller. That is
 * right almost everywhere; it is wrong for a background job that would
 * rather give its slot to other work than sit out a five-minute window.
 * `rejectingRateLimits` marks one call (and only that call: the mark rides
 * its async context, so concurrent callers are untouched) to throw a
 * `RateLimitError` instead of waiting, whenever the wait would be longer
 * than `patience`.
 */
const rejecting = new AsyncLocalStorage<number>();

export const rejectingRateLimits = <T>(patience: number, fn: () => Promise<T>): Promise<T> =>
  rejecting.run(patience, fn);

/** How long a rate limit holds a request, whichever of its timers is longest. */
export const waitOf = (data: Pick<RateLimitData, 'timeToReset' | 'retryAfter' | 'sublimitTimeout'>): number =>
  Math.max(data.timeToReset, data.retryAfter, data.sublimitTimeout);

/** The client's `rest.rejectOnRateLimit`: only inside `rejectingRateLimits`, only past its patience. */
export const rejectOnRateLimit = (data: RateLimitData): boolean => {
  const patience = rejecting.getStore();
  return patience !== undefined && waitOf(data) > patience;
};
