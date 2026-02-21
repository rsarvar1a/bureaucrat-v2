import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { $ } from 'bun';

const consoleErrorFormat = winston.format((info) => {
  if (info['error'] instanceof Error) {
    info.message = `${info.message}\n${info['error'].stack}`;
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

const consoleFormat = () =>
  winston.format.combine(
    winston.format.colorize({ level: true }),
    consoleErrorFormat(),
    winston.format.simple(),
    winston.format.timestamp(),
  );

const fileFormat = () =>
  winston.format.combine(fileErrorFormat(), winston.format.timestamp(), winston.format.json({ space: 2 }));

await $`mkdir -p logs`;

const dailyRotateFileTransport = new DailyRotateFile({
  filename: 'logs/bureaucrat-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: false,
  maxSize: '10m',
  maxFiles: '7d',
  format: fileFormat(),
});

export const logger = winston.createLogger({
  transports: [new winston.transports.Console({ level: 'info', format: consoleFormat() }), dailyRotateFileTransport],
});
