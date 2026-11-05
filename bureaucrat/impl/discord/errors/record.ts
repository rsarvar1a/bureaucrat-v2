import { AsyncLocalStorage } from 'node:async_hooks';
import { insertErrorEvent } from '../../../drizzle/error-events';
import { logger } from '../../../utilities/logger';
import { classify, framesOf, scrub } from './classify';

/**
 * Caught errors, kept in `ErrorEvent` to query back (see `queries/errors-*.sql`).
 *
 * A job runs inside `faultScope`, which names its area and what it is about;
 * every `fault` beneath it, however deep and however many jobs interleave,
 * is filed under that. Recording never blocks the caller and never throws:
 * an error about an error is logged and dropped.
 */

/** What an error cost: the job, part of the result, or nothing. */
export type Outcome = 'failed' | 'degraded' | 'ignored';

type Ids = { game?: string; export?: string; guild?: bigint | string; channel?: bigint | string };
export type FaultScope = Ids & { area: string };

const scope = new AsyncLocalStorage<FaultScope>();

export const faultScope = <T>(context: FaultScope, fn: () => Promise<T>): Promise<T> =>
  scope.run({ ...scope.getStore(), ...context }, fn);

const snowflake = (value: bigint | string | undefined): bigint | null => {
  if (value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

/** Files the error under the current scope, with `extra` (a channel, a detail) on top. */
export const fault = (
  operation: string,
  outcome: Outcome,
  error: unknown,
  extra: Partial<FaultScope> & { detail?: Record<string, unknown> } = {},
): void => {
  // `extra` outranks the scope: a catch outside the job's scope names its own.
  const context = { area: 'bot', ...scope.getStore(), ...extra };
  const classified = classify(error);
  const detail: Record<string, unknown> = { ...extra.detail };
  const frames = framesOf(error);
  if (frames) detail['stack'] = frames;
  const raw = (error as { rawError?: unknown } | null)?.rawError;
  if (classified.kind === 'discord' && raw !== undefined) {
    detail['discord'] = JSON.parse(scrub(JSON.stringify(raw))) as unknown;
  }
  if (error instanceof Error && error.cause !== undefined) detail['cause'] = classify(error.cause).message;

  logger.debug({ message: `Fault ${context.area}/${operation} (${outcome}): ${classified.message}` });
  void insertErrorEvent({
    area: context.area,
    operation,
    outcome,
    ...classified,
    game: context.game ?? null,
    export: context.export ?? null,
    guild: snowflake(context.guild),
    channel: snowflake(context.channel),
    detail,
  }).catch((insertError: unknown) => {
    logger.warn({ message: `Could not record a fault in ${context.area}/${operation}.`, error: insertError });
  });
};

/** For `.catch(...)`: records the error, then answers `fallback` as the silent catch did. */
export const swallow =
  <T>(operation: string, outcome: Outcome, fallback: T, extra?: Parameters<typeof fault>[3]) =>
  (error: unknown): T => {
    fault(operation, outcome, error, extra);
    return fallback;
  };
