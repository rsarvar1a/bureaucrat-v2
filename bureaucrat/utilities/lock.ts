const tails = new Map<string, Promise<void>>();

/**
 * Runs `fn` once every earlier holder of `key` in this process has finished,
 * so callers of one key go strictly one at a time. Only in-process: the bot
 * is one process, and a second would need the database to arbitrate.
 */
export const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = previous.then(() => new Promise<void>((resolve) => (release = resolve)));
  tails.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
};
