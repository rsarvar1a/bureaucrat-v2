import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { $ } from 'bun';

const CONSOLE_LEVEL = process.env.LOG_LEVEL || 'info';

// Some Postgres driver error work, since none of this stuff is enumerable
// (why is Javascript so stupid about enumerable properties, and why do devs
// implement their error containers like this?)

const PG_FIELDS = ['code', 'detail', 'hint', 'constraint', 'table', 'routine'] as const;

const pgDetail = (error: Error): string | null => {
  const record = error as unknown as Record<string, unknown>;
  if (typeof record['code'] !== 'string') return null;

  const details = PG_FIELDS.map((field) => {
    const value = record[field];
    return value === undefined || value === null ? null : `${field}=${String(value)}`;
  }).filter(Boolean);

  return details.length > 0 ? `  ${details.join(' ')}` : null;
};

/**
 * Renders an error with its cause chain (i.e. recursively over its causes).
 */
const describeError = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error)) return String(error);

  const frames = (error.stack ?? '').split('\n').filter((line) => line.trim().startsWith('at '));
  const parts = [[`${error.name}: ${error.message}`, ...frames].join('\n')];

  const detail = pgDetail(error);
  if (detail) parts.push(detail);

  if (error.cause !== undefined && error.cause !== null && depth < 4) {
    parts.push(`caused by: ${describeError(error.cause, depth + 1)}`);
  }

  return parts.join('\n');
};

const consoleErrorFormat = winston.format((info) => {
  if (info['error'] !== undefined) {
    info.message = `${info.message}\n${describeError(info['error'])}`;
  }
  delete info['error'];
  return info;
});

const fileErrorFormat = winston.format((info) => {
  if (info['error'] instanceof Error) {
    info['error'] = Object.assign(
      {
        message: info['error'].message,
        stack: info['error'].stack,
        detail: describeError(info['error']),
      },
      info['error'],
    );
  }

  if (info instanceof Error) {
    return Object.assign(
      {
        message: info.message,
        stack: info.stack,
      },
      info,
    );
  }

  return info;
});

/**
 * Basically just `simple()`, but with a clock, because that's useful inline
 * and not just in the enriched log object stream etc., it's not like we're
 * using a logs explorer here.
 */
const consoleLine = winston.format.printf((info) => {
  const { timestamp, level, message, ...rest } = info;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${String(timestamp)} ${level}: ${String(message)}${extras}`;
});

const consoleFormat = () =>
  winston.format.combine(
    winston.format.timestamp({ format: 'H:mm:ss.SSS' }),
    consoleErrorFormat(),
    winston.format.colorize({ level: true }),
    consoleLine,
  );

const fileFormat = () =>
  winston.format.combine(fileErrorFormat(), winston.format.timestamp(), winston.format.json({ space: 2 }));

const LOG_DIR = path.join(import.meta.dir, '..', '..', 'logs');
const TESTING = process.env.NODE_ENV === 'test';
if (!TESTING) await $`mkdir -p ${LOG_DIR}`;

const dailyRotateFileTransport = () =>
  new DailyRotateFile({
    filename: path.join(LOG_DIR, 'bureaucrat-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxSize: '10m',
    maxFiles: '7d',
    format: fileFormat(),
  });

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({ level: CONSOLE_LEVEL, format: consoleFormat() }),
    ...(TESTING ? [] : [dailyRotateFileTransport()]),
  ],
});
