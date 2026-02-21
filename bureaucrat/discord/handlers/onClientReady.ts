import type { Client } from 'discord.js';
import { logger } from '../../utilities/logger';

export default async function onClientReady(client: Client) {
  logger.info({ message: `Logged in as ${client.user?.tag}!` });
}
