import { logger } from '../../utilities/logger';

export default async function onClientError(error: Error) {
  logger.error({ message: 'An unhandled exception occurred.', error });
}
