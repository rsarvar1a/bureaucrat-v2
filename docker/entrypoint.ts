import path from 'node:path';
import { statSync } from 'node:fs';
import { $ } from 'bun';
import { logger } from '../bureaucrat/utilities/logger.ts';

/**
 * Applies committed migrations, then starts the bot.
 *
 * Generate migrations yourself with `bun run db:generate`, or just let
 * the pre-commit hook do it for you if you'd rather never test your
 * changes before pushing.
 */
const migrate = async (script: string, label: string): Promise<void> => {
  const result = await $`bun run ${script}`.quiet().nothrow();

  if (result.exitCode === 0) {
    logger.info({ message: `Migrations applied (${label}).` });
    return;
  }

  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();

  logger.error({
    message: [
      `Migrations failed for ${label} (exit ${result.exitCode}). The bot is starting anyway, so expect query errors.`,
      stdout && `stdout:\n${stdout}`,
      stderr && `stderr:\n${stderr}`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
};

const stampFile = (file: string): string | null => {
  try {
    const { mtimeMs, size } = statSync(file);
    return `${mtimeMs}:${size}`;
  } catch {
    return null;
  }
};

/**
 * Restarts the bot when `.env` changes.
 *
 * This exists to plug a gap in both the bun --watch and docker --watch solutions,
 * since a) .env isn't imported, so not in the bun watchtree, and b) it isn't built
 * into the Docker image, so touching the file doesn't trigger a rebuild event.
 */
const watchEnvironment = (): void => {
  const envPath = path.join(import.meta.dir, '..', '.env');

  let last = stampFile(envPath);
  if (last === null) return;

  setInterval(() => {
    const current = stampFile(envPath);

    if (current === null || current === last) return;

    last = current;
    logger.info({ message: 'Configuration changed (.env); restarting to pick it up.' });
    process.kill(1, 'SIGTERM');
  }, 2_000);
};

watchEnvironment();

await migrate('db:migrate', 'bureaucrat');

await import('../index.ts');
