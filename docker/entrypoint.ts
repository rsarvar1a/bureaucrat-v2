import { $ } from 'bun';
import { logger } from '../bureaucrat/utilities/logger.ts';

try {
  await $`bun run db:generate 1> /dev/null`;
  await $`bun run db:migrate 1> /dev/null`;
} catch (e) {
  logger.error({ message: 'Encountered an error during database setup.', error: e });
}

await import('../index.ts');
