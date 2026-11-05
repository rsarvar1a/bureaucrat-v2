import { AsyncLocalStorage } from 'node:async_hooks';
import { insertErrorEvent } from '../../../drizzle/error-events';
import { logger } from '../../../utilities/logger';
import { classify, framesOf, isTransient, scrub } from './classify';

/**
 * Caught errors, kept in `ErrorEvent` to query back (see `queries/errors-*.sql`).
 *
 * A job runs inside `faultScope`, which names its area and what it is about;
 * every `fault` beneath it, however deep and however many jobs interleave,
 * is filed under that. Recording never blocks the caller and never throws:
 * an error about an error is logged and dropped.
 */

/**
 * What an error cost: the job (`failed`), part of the result (`degraded`),
 * nothing (`ignored`), or nothing yet because the job stopped there on a
 * transient error rather than go on without something (`aborted`).
 */
export type Outcome = 'failed' | 'degraded' | 'ignored' | 'aborted';

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

/**
 * In a `catch` whose fallback would lose something: a transient error is
 * recorded as `aborted` and thrown on, so the job stops with nothing left
 * out and a retry carries on from there. Anything else returns to the caller.
 */
export const abortIfTransient = (operation: string, error: unknown, extra?: Parameters<typeof fault>[3]): void => {
  if (!isTransient(error)) return;
  fault(operation, 'aborted', error, extra);
  throw error;
};

/**
 * For `.catch(...)`: records the error, then answers `fallback` as the
 * silent catch did. A fallback that loses nothing (`ignored`) takes any
 * error; one that would (`degraded`, `failed`) takes only a real refusal,
 * and a transient error stops the job instead (`abortIfTransient`).
 */
export const swallow =
  <T>(operation: string, outcome: Exclude<Outcome, 'aborted'>, fallback: T, extra?: Parameters<typeof fault>[3]) =>
  (error: unknown): T => {
    if (outcome !== 'ignored') abortIfTransient(operation, error, extra);
    fault(operation, outcome, error, extra);
    return fallback;
  };
