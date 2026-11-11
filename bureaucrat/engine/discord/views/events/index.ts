import type { Client } from 'discord.js';
import {
  LifecycleEvent,
  type LifecycleAction,
  type ViewDefinition,
  type ViewInteraction,
  type ViewRow,
} from '../types';
import { destroyHandler } from './destroy';
import { detachHandler } from './detach';
import { renderHandler } from './render';

export { LifecycleEvent, type LifecycleAction };

export type LifecycleHandlerParams = {
  view: ViewRow;
  def: ViewDefinition;
  client: Client;
  interaction?: ViewInteraction;
};

export type LifecycleEventHandler = {
  event: LifecycleAction;
  execute: (params: LifecycleHandlerParams) => Promise<void>;
};

/** Ordered by precedence - destroy, then detach, then render. */
export const lifecycleHandlers: LifecycleEventHandler[] = [destroyHandler, detachHandler, renderHandler];
