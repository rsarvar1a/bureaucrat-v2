import { Client, Events, type ClientEvents } from 'discord.js';

import onInteractionCreate from './handlers/onInteractionCreate';
import onClientReady from './handlers/onClientReady';
import onClientError from './handlers/onClientError';

/**
 * Allows for the creation of top-level handlers in a declarative way.
 */
class TopLevelHandlerDefinition<E extends keyof ClientEvents> {
  constructor(
    public as: 'on' | 'once',
    public event: E,
    public handler: (...args: ClientEvents[E]) => void,
  ) {}

  registerTo(client: Client) {
    client[this.as](this.event, this.handler);
  }
}

export const handlers = [
  new TopLevelHandlerDefinition('once', Events.ClientReady, onClientReady),
  new TopLevelHandlerDefinition('on', Events.Error, onClientError),
  new TopLevelHandlerDefinition('on', Events.InteractionCreate, onInteractionCreate),
  // etc. for other top-level handlers
] as const;
