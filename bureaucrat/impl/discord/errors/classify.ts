/**
 * What an error is, in columns that group well: its kind, a code (Discord's
 * JSON code, an errno, a SQLSTATE, discord.js's own), the HTTP status, and
 * the route with its ids taken out, so a thousand failures on a thousand
 * channels are one hotspot. Pure, so it is tested without a socket.
 */
export type Classified = {
  kind: 'discord' | 'http' | 'rate-limit' | 'network' | 'database' | 'internal' | 'other';
  code: string | null;
  status: number | null;
  route: string | null;
  message: string;
};

const MESSAGE_CAP = 500;

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ConnectionRefused',
  'ConnectionClosed',
  // postgres-js's own, for a connection that could not be made or was lost.
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
]);

/**
 * `METHOD /path` with every id `:id`, a reaction's emoji `:emoji` and a
 * webhook's token `:token`. The token is a credential, so it never leaves
 * here; the query string goes too.
 */
export const routeOf = (method: string, url: string): string => {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split('?')[0] ?? url;
  }
  const segments = path.replace(/^\/api\/v\d+/, '').split('/');
  const out = segments.map((segment, index) => {
    const previous = segments[index - 1];
    if (/^\d{5,}$/.test(segment)) return ':id';
    if (previous === 'reactions' && segment !== '') return ':emoji';
    if (segments[index - 2] === 'webhooks' && previous && /^\d{5,}$/.test(previous)) return ':token';
    return segment;
  });
  return `${method.toUpperCase()} ${out.join('/')}`;
};

const codeOf = (error: Error): string | null => {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : null;
};

/** A webhook token in any URL the text quotes, replaced, since the token is a credential. */
export const scrub = (text: string): string => text.replace(/(\/webhooks\/\d+\/)[\w.-]+/g, '$1:token');

// Some carry no message (a rate limit's is empty) but say what they are in their name.
const messageOf = (error: unknown): string =>
  scrub(error instanceof Error ? error.message || error.name : String(error)).slice(0, MESSAGE_CAP);

type Request = { method: string; url: string };

/**
 * By shape and name, not `instanceof`: a second copy of `@discordjs/rest`
 * in the tree would make its errors fail the class check and file as other.
 */
const requestOf = (error: Error): Request | null => {
  const { method, url } = error as Partial<Request>;
  return typeof method === 'string' && typeof url === 'string' ? { method, url } : null;
};
const statusOf = (error: Error): number | null => {
  const { status } = error as { status?: unknown };
  return typeof status === 'number' ? status : null;
};

/**
 * A query wrapper (drizzle's `Failed query: …`) says nothing of its own, and
 * its message carries the statement's parameters, which can be anything a
 * message said. The cause is the error.
 */
const isWrapper = (error: Error): boolean =>
  error.cause instanceof Error && (error.name === 'DrizzleQueryError' || error.message.startsWith('Failed query:'));

export const classify = (error: unknown): Classified => {
  if (error instanceof Error && isWrapper(error)) return classify(error.cause);
  const message = messageOf(error);
  if (!(error instanceof Error)) return { kind: 'other', code: null, status: null, route: null, message };
  const request = requestOf(error);
  const route = request ? routeOf(request.method, request.url) : null;
  const code = codeOf(error);

  if (error.name.startsWith('DiscordAPIError') && request) {
    return { kind: 'discord', code, status: statusOf(error), route, message };
  }
  if (error.name.startsWith('RateLimitError') && request) {
    const { global, scope } = error as { global?: unknown; scope?: unknown };
    const limit = global === true ? 'global' : typeof scope === 'string' ? scope : null;
    return { kind: 'rate-limit', code: limit, status: 429, route, message };
  }
  if (error.name.startsWith('HTTPError') && request) {
    return { kind: 'http', code: null, status: statusOf(error), route, message };
  }
  if (error.name === 'PostgresError' || (code !== null && /^[0-9A-Z]{5}$/.test(code) && 'severity' in error)) {
    return { kind: 'database', code, status: null, route: null, message };
  }
  if (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    (code !== null && (NETWORK_CODES.has(code) || code.startsWith('UND_ERR')))
  ) {
    return { kind: 'network', code: code ?? error.name, status: null, route: null, message };
  }
  // discord.js's own errors name themselves `Error [Code]` and carry the code.
  if (/^\w*Error \[\w+\]$/.test(error.name)) return { kind: 'internal', code, status: null, route: null, message };
  return { kind: 'other', code, status: null, route: null, message };
};

/** The first few frames of the stack, which is where a hotspot lives. */
export const framesOf = (error: unknown, count = 8): string | null => {
  if (!(error instanceof Error) || !error.stack) return null;
  const frames = error.stack
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    .slice(0, count)
    .map((line) => line.trim());
  return frames.length > 0 ? frames.join('\n') : null;
};

/** SQLSTATEs that say the database could not be reached or let go, not that the query was wrong. */
const DATABASE_TRANSIENT = /^(08|53|57P0)|^(40001|40P01)$/;

/**
 * Whether the error is the moment's and not the request's: the network, a
 * rate limit, Discord's or the database's own trouble. Such an error is
 * never a reason to leave something out; the job stops and is retried.
 */
export const isTransient = (error: unknown): boolean => {
  const { kind, code, status } = classify(error);
  if (kind === 'network' || kind === 'rate-limit') return true;
  if ((kind === 'discord' || kind === 'http') && status !== null && status >= 500) return true;
  return kind === 'database' && code !== null && DATABASE_TRANSIENT.test(code);
};
